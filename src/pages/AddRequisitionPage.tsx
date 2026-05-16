import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { 
  ArrowLeft, 
  Plus, 
  Search, 
  Trash2, 
  Save, 
  Package, 
  MapPin, 
  FileText,
  Loader2,
  AlertCircle,
  History,
  User
} from "lucide-react";
import { formatCurrency } from "../lib/format";

import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { SectionCard } from "../components/ui/SectionCard";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { listPosProducts } from "../services/posService";
import { 
  createPurchaseRequisition, 
  updatePurchaseRequisition, 
  listPurchaseRequisitions,
  type PurchaseRequisition,
  type PurchaseRequisitionItem
} from "../services/purchaseService";
import { listLocations } from "../services/settingsService";
import { listSuppliers } from "../services/supplierService";

type RequisitionLine = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  notes?: string;
};

type RequisitionForm = {
  locationId: string;
  supplierId?: string;
  notes: string;
  lines: RequisitionLine[];
};

const emptyForm: RequisitionForm = {
  locationId: "",
  supplierId: "",
  notes: "",
  lines: []
};

const DRAFT_KEY = "pos_requisition_draft";

export function AddRequisitionPage() {
  const { t } = useTranslation();
  const { activeLocationId, profile } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const { run } = useAsyncAction();
  const DRAFT_KEY = `pos_requisition_draft_${profile?.id || 'guest'}`;

  const [form, setForm] = useState<RequisitionForm>(() => {
    if (!id) {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        try {
          return { ...emptyForm, ...JSON.parse(saved) };
        } catch (e) {
          return emptyForm;
        }
      }
    }
    return emptyForm;
  });

  const [products, setProducts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [productFocus, setProductFocus] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [locs, sups] = await Promise.all([
          listLocations(),
          listSuppliers()
        ]);
        setLocations(locs);
        setSuppliers(sups);
        
        if (id) {
          // Editing mode
          const allReqs = await listPurchaseRequisitions();
          const req = allReqs.find(r => r.id === id);
          if (req) {
            setForm({
              locationId: req.location_id,
              supplierId: req.supplier_id || "",
              notes: req.notes || "",
              lines: req.items.map(i => ({
                id: i.id,
                product_id: i.product_id,
                product_name: i.product_name || "Unknown",
                quantity: i.quantity,
                unit_cost: i.unit_cost,
                notes: i.notes
              }))
            });
          }
        } else if (!form.locationId && activeLocationId) {
          setForm(prev => ({ ...prev, locationId: activeLocationId }));
        }

        if (form.locationId || activeLocationId) {
          const p = await listPosProducts(form.locationId || activeLocationId, 1000);
          setProducts(p);
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, [id]);

  useEffect(() => {
    if (!id) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    }
  }, [form, id]);

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    
    let result = [...products];
    if (query) {
      result = result.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.barcode?.toLowerCase().includes(query)
      );
    }

    // Sort: Out of stock first, then low stock, then in stock
    return result.sort((a, b) => {
      const aIsLow = a.stock_quantity <= (a.reorder_level || 5);
      const bIsLow = b.stock_quantity <= (b.reorder_level || 5);
      if (aIsLow && !bIsLow) return -1;
      if (!aIsLow && bIsLow) return 1;
      return 0;
    }).slice(0, 15);
  }, [products, searchTerm]);

  const addLine = (product: any) => {
    if (form.lines.some(l => l.product_id === product.id)) {
      showToast("warning", "Product already in list");
      return;
    }

    const newLine: RequisitionLine = {
      id: `${product.id}-${Date.now()}`,
      product_id: product.id,
      product_name: product.name,
      quantity: 1,
      unit_cost: product.cost_price || 0,
      notes: ""
    };

    setForm(prev => ({
      ...prev,
      lines: [...prev.lines, newLine]
    }));
    setSearchTerm("");
  };

  const updateLine = (id: string, updates: Partial<RequisitionLine>) => {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.map(l => l.id === id ? { ...l, ...updates } : l)
    }));
  };

  const removeLine = (id: string) => {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.filter(l => l.id !== id)
    }));
  };

  const loadAllLowStock = () => {
    const lowStockItems = products.filter(p => p.stock_quantity <= (p.reorder_level || 5) || p.stock_quantity === 0);
    const newLines: RequisitionLine[] = lowStockItems.map(p => ({
      id: `${p.id}-${Date.now()}-${Math.random()}`,
      product_id: p.id,
      product_name: p.name,
      quantity: Math.max(1, (p.reorder_level || 5) * 2 - p.stock_quantity),
      unit_cost: p.cost_price || 0,
      notes: "Auto-added low stock"
    })).filter(nl => !form.lines.some(fl => fl.product_id === nl.product_id));

    if (newLines.length === 0) {
      showToast("info", "All low stock items are already added");
      return;
    }

    setForm(prev => ({
      ...prev,
      lines: [...prev.lines, ...newLines]
    }));
    showToast("success", `Added ${newLines.length} low stock items`);
  };

  const totalValue = useMemo(() => {
    return form.lines.reduce((sum, l) => sum + (l.quantity * l.unit_cost), 0);
  }, [form.lines]);

  const handleSave = async () => {
    if (!form.locationId || form.lines.length === 0) {
      showToast("error", "Please select location and add items");
      return;
    }

    try {
      const payload = {
        location_id: form.locationId,
        supplier_id: form.supplierId || undefined,
        notes: form.notes,
        items: form.lines.map(l => ({
          product_id: l.product_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          notes: l.notes
        }))
      };

      if (id) {
        await updatePurchaseRequisition(id, payload);
        showToast("success", "Requisition updated successfully");
      } else {
        await createPurchaseRequisition(payload);
        showToast("success", "Requisition created successfully");
        localStorage.removeItem(DRAFT_KEY);
      }

      navigate("/requisitions");
    } catch (error: any) {
      showToast("error", error.message || "Failed to save requisition");
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
            onClick={() => navigate("/requisitions")}
            className="rounded-xl bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-ink">{id ? "Edit Requisition" : "New Requisition"}</h1>
            <p className="text-slate-500">Plan inventory needs and restock low-stock items</p>
          </div>
        </div>

        <div className="flex gap-3">
          {!id && (
            <button
              onClick={() => {
                if (window.confirm("Discard draft?")) {
                  localStorage.removeItem(DRAFT_KEY);
                  setForm({ ...emptyForm, locationId: activeLocationId || "" });
                }
              }}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              Discard Draft
            </button>
          )}
          <button
            onClick={handleSave}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-brand-700"
          >
            <Save size={18} />
            {id ? "Update Requisition" : "Create Requisition"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Planning Details">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Destination Location</label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={form.locationId}
                    onChange={e => setForm({ ...form, locationId: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                  >
                    <option value="">Choose location...</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Preferred Supplier (Optional)</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={form.supplierId}
                    onChange={e => setForm({ ...form, supplierId: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                  >
                    <option value="">Any Supplier</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard 
            title="Products Needed" 
            subtitle="Showing low-stock items for selection"
          >
            <div className="mb-6">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onFocus={() => setProductFocus(true)}
                  onBlur={() => setTimeout(() => setProductFocus(false), 200)}
                  placeholder="Search low-stock products..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm outline-none focus:border-brand-500 transition shadow-sm"
                />
                {productFocus && filteredProducts.length > 0 && (
                  <div className="absolute top-full z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
                    {filteredProducts.map(p => {
                      const isLow = p.stock_quantity <= (p.reorder_level || 5);
                      const isOut = p.stock_quantity <= 0;
                      
                      return (
                        <button
                          key={p.id}
                          onMouseDown={() => addLine(p)}
                          className={`flex w-full items-center justify-between px-4 py-3 text-left transition ${
                            isOut ? 'bg-rose-50/30 hover:bg-rose-50' : 
                            isLow ? 'bg-amber-50/30 hover:bg-amber-50' : 
                            'hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-ink">{p.name}</p>
                              {!isLow && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">IN STOCK</span>
                              )}
                              {isOut && (
                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">OUT OF STOCK</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">Stock: {p.stock_quantity} | Reorder at: {p.reorder_level || 5}</p>
                          </div>
                          <Plus size={18} className={isLow ? "text-brand-500" : "text-slate-300"} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                    <th className="pb-4 pl-2">Product</th>
                    <th className="pb-4">Quantity to Request</th>
                    <th className="pb-4 text-right">Est. Unit Cost</th>
                    <th className="pb-4 text-right">Line Total</th>
                    <th className="pb-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {form.lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center text-slate-400">
                        <Package size={40} className="mx-auto mb-3 opacity-20" />
                        <p>Search and select products to restock</p>
                      </td>
                    </tr>
                  ) : (
                    form.lines.map(line => (
                      <tr key={line.id} className="group transition hover:bg-slate-50/50">
                        <td className="py-4 pl-2">
                          <p className="font-bold text-ink">{line.product_name}</p>
                        </td>
                        <td className="py-4">
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={e => updateLine(line.id, { quantity: parseInt(e.target.value) || 1 })}
                            className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 font-black outline-none focus:border-brand-500"
                          />
                        </td>
                        <td className="py-4 text-right font-bold text-slate-600">
                          {formatCurrency(line.unit_cost)}
                        </td>
                        <td className="py-4 text-right font-black text-ink">
                          {formatCurrency(line.quantity * line.unit_cost)}
                        </td>
                        <td className="py-4 text-right pr-2">
                          <button
                            onClick={() => removeLine(line.id)}
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

        <div className="space-y-6">
          <SectionCard title="Summary">
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Total Items</span>
                <span className="font-bold text-ink">{form.lines.length} products</span>
              </div>
              <div className="flex justify-between items-center text-lg pt-4 border-t border-slate-100">
                <span className="font-bold text-ink">Est. Total Value</span>
                <span className="font-black text-brand-600">{formatCurrency(totalValue)}</span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Planning Notes">
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-brand-500 h-40 resize-none"
              placeholder="Explain why this restock is needed or special instructions..."
            />
          </SectionCard>

          <div className="rounded-[2rem] bg-slate-900 p-8 text-white shadow-xl">
            <h3 className="text-lg font-bold">Smart Planning</h3>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Purchase requisitions help you organize needs before spending money. Once approved, you can import this list directly into a purchase order.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
