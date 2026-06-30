import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Plus, 
  Search, 
  Trash2, 
  Save, 
  Package, 
  User, 
  MapPin, 
  Calendar, 
  CreditCard, 
  Truck,
  FileText,
  Import,
  Loader2
} from "lucide-react";
import { formatCurrency } from "../lib/format";

import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { SectionCard } from "../components/ui/SectionCard";
import { QuickAddProductModal } from "../components/ui/QuickAddProductModal";
import { 
  createPurchase, 
  type PurchaseRequisition,
  listPurchaseRequisitions
} from "../services/purchaseService";
import { listProducts } from "../services/productService";
import { listSuppliers } from "../services/supplierService";
import { listLocations } from "../services/settingsService";
import { useSettings } from "../hooks/useSettings";
import type { PaymentMethod } from "../types/database";
import { calculateVatLine, getVatSettings, isVatEnabled } from "../services/vatService";

type PaymentStatus = "Paid" | "Due" | "Partially Paid";
type DeliveryStatus = "Pending" | "Received";

type PurchaseLine = {
  id: string;
  productId: string;
  product: string;
  barcode?: string | null;
  quantity: number;
  purchasePrice: number;
  profitPercentage: number;
  sellingPrice: number;
};

type PurchaseFormState = {
  supplierId: string;
  locationId: string;
  paymentStatus: PaymentStatus;
  paidAmount: string;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  deliveryStatus: DeliveryStatus;
  date: string;
  items: PurchaseLine[];
  notes: string;
  requisitionId?: string;
};

const createEmptyForm = (): PurchaseFormState => ({
  supplierId: "",
  locationId: "",
  paymentStatus: "Due",
  paidAmount: "",
  paymentMethod: "cash",
  paymentDate: new Date().toISOString().split("T")[0],
  deliveryStatus: "Pending",
  date: new Date().toISOString().split("T")[0],
  items: [],
  notes: "",
});

export function AddPurchasePage() {
  const { business, activeLocationId, profile, assignedLocations } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const { settings } = useSettings();

  const DRAFT_KEY = `pos_purchase_draft_${profile?.id || 'guest'}`;

  const [form, setForm] = useState<PurchaseFormState>(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...createEmptyForm(), ...parsed };
      } catch (e) {
        return createEmptyForm();
      }
    }
    return createEmptyForm();
  });

  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [productSearch, setProductSearch] = useState("");
  const [productFocus, setProductFocus] = useState(false);
  const [quickProductOpen, setQuickProductOpen] = useState(false);
  const [pendingRequisitions, setPendingRequisitions] = useState<PurchaseRequisition[]>([]);
  const [selectedReqId, setSelectedReqId] = useState("");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!business?.id) {
        setLoading(false);
        return;
      }

      try {
        const productPromise = listProducts(null, business.id)
          .then(data => {
            if (!cancelled) setProducts(data);
          });

        const supplierPromise = listSuppliers(business.id)
          .then(data => {
            if (!cancelled) setSuppliers(data);
          });

        const locationPromise = listLocations(business.id)
          .then(data => {
            if (!cancelled) setLocations(data.length ? data : assignedLocations);
          });

        await Promise.allSettled([productPromise, supplierPromise, locationPromise]);

        if (cancelled) return;
        
        if (!form.locationId && activeLocationId) {
          setForm(prev => ({ ...prev, locationId: activeLocationId }));
        }

        setLoading(false);

        listPurchaseRequisitions('pending', business.id)
          .then(data => {
            if (!cancelled) setPendingRequisitions(data);
          })
          .catch(error => console.error("Failed to load requisitions:", error));
      } catch (error) {
        console.error("Failed to load data:", error);
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [activeLocationId, business?.id, assignedLocations]);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return [];
    return products.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.barcode?.toLowerCase().includes(query)
    ).slice(0, 10);
  }, [products, productSearch]);

  const handleImportRequisition = async () => {
    if (!selectedReqId) return;
    setImporting(true);
    try {
      const req = pendingRequisitions.find(r => r.id === selectedReqId);
      
      if (!req) return;

      const newItems: PurchaseLine[] = req.items.map((item: any) => {
        const prod = products.find(p => p.id === item.product_id);
        return {
          id: `${item.product_id}-${Date.now()}-${Math.random()}`,
          productId: item.product_id,
          product: prod?.name || item.product_name || "Unknown Product",
          barcode: prod?.barcode || undefined,
          quantity: item.quantity,
          purchasePrice: prod?.cost_price ?? item.unit_cost ?? 0,
          profitPercentage: prod?.cost_price > 0
            ? Math.round((((prod?.selling_price || 0) - (prod?.cost_price || 0)) / (prod?.cost_price || 1)) * 100)
            : 0,
          sellingPrice: prod?.selling_price ?? 0,
        };
      });

      setForm(prev => ({
        ...prev,
        locationId: req.location_id || prev.locationId,
        supplierId: req.supplier_id || prev.supplierId,
        requisitionId: req.id,
        items: [...prev.items, ...newItems].filter((v, i, a) => a.findIndex(t => t.productId === v.productId) === i)
      }));

      showToast("success", `Imported ${newItems.length} items from requisition`);
      setSelectedReqId("");
    } catch (err) {
      console.error("Import error:", err);
      showToast("error", "Failed to import requisition");
    } finally {
      setImporting(false);
    }
  };

  const purchaseTotal = useMemo(() => {
    const vatSettings = getVatSettings(settings);
    return form.items.reduce((sum, item) => {
      const line = calculateVatLine({
        amount: item.quantity * item.purchasePrice,
        vatRate: vatSettings.vatRate,
        priceType: "exclusive",
        vatEnabled: isVatEnabled(settings),
        supplierVatRegistered: true,
      });
      return sum + line.totalAmount;
    }, 0);
  }, [form.items, settings]);

  const purchaseVatSummary = useMemo(() => {
    const vatSettings = getVatSettings(settings);
    const supplierVatRegistered = true;
    const lines = form.items.map((item) => calculateVatLine({
      amount: item.quantity * item.purchasePrice,
      vatRate: vatSettings.vatRate,
      priceType: "exclusive",
      vatEnabled: isVatEnabled(settings),
      supplierVatRegistered,
    }));
    return {
      settings: vatSettings,
      supplierVatRegistered,
      beforeVat: lines.reduce((sum, line) => sum + line.amountBeforeVat, 0),
      inputVat: lines.reduce((sum, line) => sum + line.vatAmount, 0),
      total: lines.reduce((sum, line) => sum + line.totalAmount, 0),
      lines,
    };
  }, [form.items, settings]);

  const addProduct = (product: any) => {
    if (form.items.some(item => item.productId === product.id)) {
      showToast("warning", "Product already in list");
      return;
    }

    const cost = Number(product.cost_price || 0);
    const price = Number(product.selling_price || 0);
    const defaultProfit = settings?.default_profit_percentage ?? 25;
    const profit = cost > 0 ? Math.round(((price - cost) / cost) * 100) : defaultProfit;

    const newLine: PurchaseLine = {
      id: `${product.id}-${Date.now()}`,
      productId: product.id,
      product: product.name,
      barcode: product.barcode,
      quantity: 1,
      purchasePrice: cost,
      profitPercentage: profit,
      sellingPrice: price || Number((cost + (cost * profit / 100)).toFixed(2))
    };

    setForm(prev => ({
      ...prev,
      items: [...prev.items, newLine]
    }));
    setProductSearch("");
  };

  const updateLine = (id: string, updates: Partial<PurchaseLine>) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id !== id) return item;
        const next = { ...item, ...updates };
        
        // Recalculate prices
        if ('purchasePrice' in updates || 'profitPercentage' in updates) {
          next.sellingPrice = Number((next.purchasePrice + (next.purchasePrice * next.profitPercentage / 100)).toFixed(2));
        } else if ('sellingPrice' in updates && next.purchasePrice > 0) {
          next.profitPercentage = Number((((next.sellingPrice - next.purchasePrice) / next.purchasePrice) * 100).toFixed(1));
        }
        
        return next;
      })
    }));
  };

  const removeLine = (id: string) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };


  const handleSave = async () => {
    if (savingRef.current) return;

    // Comprehensive validation
    if (!form.supplierId) {
      showToast("error", "⚠️ Please select a supplier - it's required");
      return;
    }

    if (!form.locationId) {
      showToast("error", "⚠️ Please select a location where stock will be stored");
      return;
    }

    if (form.items.length === 0) {
      showToast("error", "⚠️ Add at least one product to the purchase");
      return;
    }

    // Validate all items have valid quantities and prices
    for (const item of form.items) {
      if (!item.quantity || item.quantity <= 0) {
        showToast("error", `⚠️ Product "${item.product}" has invalid quantity`);
        return;
      }
      if (!item.purchasePrice || item.purchasePrice < 0) {
        showToast("error", `⚠️ Product "${item.product}" has invalid purchase price`);
        return;
      }
    }

    if (form.paymentStatus === "Partially Paid") {
      const paidAmount = Number(form.paidAmount || 0);
      if (paidAmount <= 0 || paidAmount >= purchaseTotal) {
        showToast("error", "⚠️ Partial payment must be between 0 and total amount");
        return;
      }
    }

    try {
      savingRef.current = true;
      setSaving(true);
      const initialPaidAmount =
        form.paymentStatus === "Paid"
          ? purchaseTotal
          : form.paymentStatus === "Partially Paid"
            ? Number(form.paidAmount || 0)
            : 0;

      await createPurchase({
        supplier_id: form.supplierId,
        location_id: form.locationId,
        total_cost: purchaseTotal,
        payment_status: form.paymentStatus === "Paid" ? "paid" : form.paymentStatus === "Partially Paid" ? "partial" : "unpaid",
        paid_amount: initialPaidAmount,
        payment_method: form.paymentMethod,
        paid_at: form.paymentDate,
        delivery_status: form.deliveryStatus === "Received" ? "received" : "pending",
        purchase_date: form.date,
        notes: form.notes,
        requisition_id: form.requisitionId,
        vat_rate: purchaseVatSummary.settings.vatRate,
        supplier_vat_registered: purchaseVatSummary.supplierVatRegistered,
        price_type: "exclusive",
        amount_before_vat: purchaseVatSummary.beforeVat,
        input_vat: purchaseVatSummary.inputVat,
        items: form.items.map(item => ({
          product_id: item.productId,
          quantity: item.quantity,
          cost_price: item.purchasePrice,
          selling_price: item.sellingPrice,
          vat_rate: purchaseVatSummary.settings.vatRate,
          supplier_vat_registered: purchaseVatSummary.supplierVatRegistered,
          amount_before_vat: calculateVatLine({
            amount: item.quantity * item.purchasePrice,
            vatRate: purchaseVatSummary.settings.vatRate,
            priceType: "exclusive",
            vatEnabled: isVatEnabled(settings),
            supplierVatRegistered: purchaseVatSummary.supplierVatRegistered,
          }).amountBeforeVat,
          input_vat: calculateVatLine({
            amount: item.quantity * item.purchasePrice,
            vatRate: purchaseVatSummary.settings.vatRate,
            priceType: "exclusive",
            vatEnabled: isVatEnabled(settings),
            supplierVatRegistered: purchaseVatSummary.supplierVatRegistered,
          }).vatAmount,
        })),
      });

      showToast("success", "✓ Purchase recorded successfully");
      showToast("success", "✓ Stock updated");
      localStorage.removeItem(DRAFT_KEY);
      navigate("/purchases");
    } catch (error: any) {
      const message = error.message || "Failed to save purchase";
      showToast("error", `⚠️ ${message}`);
      console.error("Save error:", error);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate("/purchases")}
            className="rounded-xl bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-ink">New Purchase</h1>
            <p className="text-slate-500">Record a new stock purchase from supplier</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              if (window.confirm("Discard draft?")) {
                localStorage.removeItem(DRAFT_KEY);
                setForm(createEmptyForm());
              }
            }}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
          >
            Discard Draft
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? "Saving..." : "Save Purchase"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Form Area */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Details">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Supplier</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={form.supplierId}
                    onChange={e => setForm({ ...form, supplierId: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Location</label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={form.locationId}
                    onChange={e => setForm({ ...form, locationId: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                  >
                    <option value="">Select Location</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Date</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                  />
                </div>
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Import Requisition</label>
                  <div className="relative">
                    <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      value={selectedReqId}
                      onChange={e => setSelectedReqId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                    >
                      <option value="">Select Pending Requisition</option>
                      {pendingRequisitions.map(r => (
                        <option key={r.id} value={r.id}>
                          #{r.requisition_number} - {r.location_name} ({r.items.length} items)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleImportRequisition}
                  disabled={importing || !selectedReqId}
                  className="rounded-xl bg-brand-50 p-3 text-brand-600 transition hover:bg-brand-100 disabled:opacity-50"
                  title="Import"
                >
                  <Import size={18} />
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Products" subtitle="Add items to this purchase">
            <div className="mb-6">
              <div className="relative flex gap-2">
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    onFocus={() => setProductFocus(true)}
                    onBlur={() => setTimeout(() => setProductFocus(false), 200)}
                    placeholder="Search products by name or barcode..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm outline-none focus:border-brand-500 transition shadow-sm"
                  />
                  {productFocus && filteredProducts.length > 0 && (
                    <div className="absolute top-full z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
                      {filteredProducts.map(p => (
                        <button
                          key={p.id}
                          onMouseDown={() => addProduct(p)}
                          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-brand-50 transition"
                        >
                          <div>
                            <p className="text-sm font-bold text-ink">{p.name}</p>
                            <p className="text-xs text-slate-500">{p.barcode || 'No barcode'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-brand-600">{formatCurrency(p.cost_price)}</p>
                            <p className="text-xs text-slate-400">Stock: {p.stock_quantity}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setQuickProductOpen(true)}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg transition hover:scale-105"
                >
                  <Plus size={24} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                    <th className="pb-4 pl-2">Product</th>
                    <th className="pb-4">Qty</th>
                    <th className="pb-4 text-right" title="Enter the purchase cost before VAT. Input VAT is calculated separately.">Cost Before VAT</th>
                    <th className="pb-4 text-right">Selling (RWF)</th>
                    <th className="pb-4 text-right">Profit %</th>
                    <th className="pb-4 text-right">Total Incl. VAT</th>
                    <th className="pb-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {form.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-20 text-center text-slate-400">
                        <Package size={40} className="mx-auto mb-3 opacity-20" />
                        <p>No products added yet</p>
                      </td>
                    </tr>
                  ) : (
                    form.items.map(item => (
                      <tr key={item.id} className="group transition hover:bg-slate-50/50">
                        <td className="py-4 pl-2">
                          <p className="font-bold text-ink">{item.product}</p>
                          <p className="text-xs text-slate-400">{item.barcode}</p>
                        </td>
                        <td className="py-4">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={e => updateLine(item.id, { quantity: parseInt(e.target.value) || 1 })}
                            className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-bold outline-none focus:border-brand-500"
                          />
                        </td>
                        <td className="py-4 text-right">
                          <input
                            type="number"
                            value={item.purchasePrice}
                            onChange={e => updateLine(item.id, { purchasePrice: parseFloat(e.target.value) || 0 })}
                            className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right font-bold outline-none focus:border-brand-500"
                          />
                        </td>
                        <td className="py-4 text-right">
                          <input
                            type="number"
                            value={item.sellingPrice}
                            onChange={e => updateLine(item.id, { sellingPrice: parseFloat(e.target.value) || 0 })}
                            className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right font-bold outline-none focus:border-brand-500"
                          />
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              value={item.profitPercentage}
                              onChange={e => updateLine(item.id, { profitPercentage: parseFloat(e.target.value) || 0 })}
                              className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right font-bold outline-none focus:border-brand-500"
                            />
                            <span className="text-slate-400">%</span>
                          </div>
                        </td>
                        <td className="py-4 text-right font-bold text-ink">
                          {formatCurrency(calculateVatLine({
                            amount: item.quantity * item.purchasePrice,
                            vatRate: purchaseVatSummary.settings.vatRate,
                            priceType: "exclusive",
                            vatEnabled: isVatEnabled(settings),
                            supplierVatRegistered: true,
                          }).totalAmount)}
                        </td>
                        <td className="py-4 text-right pr-2">
                          <button
                            onClick={() => removeLine(item.id)}
                            className="rounded-lg p-2 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <SectionCard title="Payment">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Status</label>
                <div className="relative">
                  <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={form.paymentStatus}
                    onChange={e => setForm({ ...form, paymentStatus: e.target.value as PaymentStatus })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Due">Due</option>
                    <option value="Partially Paid">Partially Paid</option>
                  </select>
                </div>
              </div>

              {form.paymentStatus !== "Due" && (
                <>
                  {form.paymentStatus === "Partially Paid" && (
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Paid Amount</label>
                      <input
                        type="number"
                        value={form.paidAmount}
                        onChange={e => setForm({ ...form, paidAmount: e.target.value })}
                        className="w-full rounded-xl border border-emerald-100 bg-emerald-50 py-2.5 px-3 text-sm font-bold text-emerald-700 outline-none focus:border-emerald-500 transition"
                        placeholder="0"
                      />
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Method</label>
                    <select
                      value={form.paymentMethod}
                      onChange={e => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-brand-500 transition"
                    >
                      <option value="cash">Cash</option>
                      <option value="momo">Momo</option>
                      <option value="card">Card</option>
                      <option value="bank">Bank</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Payment Date</label>
                    <input
                      type="date"
                      value={form.paymentDate}
                      onChange={e => setForm({ ...form, paymentDate: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-brand-500 transition"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Delivery Status</label>
                <div className="relative">
                  <Truck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={form.deliveryStatus}
                    onChange={e => setForm({ ...form, deliveryStatus: e.target.value as DeliveryStatus })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Received">Received</option>
                  </select>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Summary">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500" title="Purchase value before eligible VAT is added or extracted.">Purchases Before VAT</span>
                <span className="font-bold text-ink">{formatCurrency(purchaseVatSummary.beforeVat)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500" title="VAT paid on purchases from VAT-registered suppliers. This becomes Input VAT.">Input VAT</span>
                <span className="font-bold text-emerald-700">{formatCurrency(purchaseVatSummary.inputVat)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Items</span>
                <span className="font-bold text-ink">{form.items.length} items</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-3 text-lg">
                <span className="font-bold text-ink">Grand Total</span>
                <span className="font-black text-brand-600">{formatCurrency(purchaseTotal)}</span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Notes">
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-brand-500 h-32 resize-none"
              placeholder="Any extra details about this purchase..."
            />
          </SectionCard>
        </div>
      </div>

      <QuickAddProductModal
        isOpen={quickProductOpen}
        onClose={() => setQuickProductOpen(false)}
        onSuccess={() => {
          listProducts(null, business?.id).then(setProducts);
          setQuickProductOpen(false);
        }}
      />
    </div>
  );
}
