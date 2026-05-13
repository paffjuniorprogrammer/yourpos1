import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  AlertTriangle,
  History
} from "lucide-react";
import { formatCurrency } from "../lib/format";

import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { SectionCard } from "../components/ui/SectionCard";
import { QuickAddProductModal } from "../components/ui/QuickAddProductModal";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { listPosProducts } from "../services/posService";
import { recordStockCount } from "../services/stockService";
import { listLocations } from "../services/settingsService";

type CountMode = "Add" | "Subtract";

type CountingLine = {
  id: string;
  productId: string;
  name: string;
  stockQty: number;
  mode: CountMode;
  reason: string;
  countedQty: number;
};

type CountingForm = {
  locationId: string;
  notes: string;
  lines: CountingLine[];
};

const emptyCountingForm: CountingForm = { 
  locationId: "", 
  notes: "", 
  lines: [] 
};

export function AddStockCountPage() {
  const { t } = useTranslation();
  const { profile, activeLocationId, business } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const { run } = useAsyncAction();

  const DRAFT_KEY = `pos_stock_count_draft_${profile?.id || 'guest'}`;

  const [form, setForm] = useState<CountingForm>(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...emptyCountingForm, ...parsed };
      } catch (e) {
        return emptyCountingForm;
      }
    }
    return emptyCountingForm;
  });

  const [products, setProducts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [productSearch, setProductSearch] = useState("");
  const [productFocus, setProductFocus] = useState(false);
  const [quickProductOpen, setQuickProductOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const locs = await listLocations();
        setLocations(locs);
        
        const initialLoc = form.locationId || activeLocationId || (locs.length > 0 ? locs[0].id : "");
        if (initialLoc) {
          setForm(prev => ({ ...prev, locationId: initialLoc }));
          const p = await listPosProducts(initialLoc, 1000);
          setProducts(p);
        }
      } catch (error) {
        console.error("Failed to load locations:", error);
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!form.locationId) return;
    let active = true;
    async function updateProducts() {
      try {
        const p = await listPosProducts(form.locationId, 1000);
        if (active) setProducts(p);
      } catch (error) {
        console.error("Failed to update products:", error);
      }
    }
    updateProducts();
    return () => { active = false; };
  }, [form.locationId]);

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

  const addLine = (product: any) => {
    if (form.lines.some(l => l.productId === product.id)) {
      showToast("warning", "Product already in list");
      return;
    }

    const newLine: CountingLine = {
      id: `${product.id}-${Date.now()}`,
      productId: product.id,
      name: product.name,
      stockQty: product.stock_quantity,
      mode: "Add",
      reason: "correction",
      countedQty: 1
    };

    setForm(prev => ({
      ...prev,
      lines: [...prev.lines, newLine]
    }));
    setProductSearch("");
  };

  const updateLine = (id: string, updates: Partial<CountingLine>) => {
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

  const handleSave = async () => {
    if (!form.locationId || form.lines.length === 0) {
      showToast("error", "Please select location and add items");
      return;
    }

    const userId = profile?.id;
    if (!userId) {
      showToast("error", "Session expired. Please login again.");
      return;
    }

    try {
      await recordStockCount(
        form.locationId,
        business?.id || "",
        userId,
        form.notes,
        form.lines.map(line => ({
          productId: line.productId,
          systemQuantity: line.stockQty,
          countedQuantity: line.countedQty,
          mode: line.mode,
          reason: line.reason
        }))
      );

      showToast("success", "Stock count recorded successfully");
      localStorage.removeItem(DRAFT_KEY);
      navigate("/stock");
    } catch (error: any) {
      showToast("error", error.message || "Failed to save stock count");
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
            onClick={() => navigate("/stock")}
            className="rounded-xl bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-ink">New Stock Count</h1>
            <p className="text-slate-500">Record stock adjustments and inventory counts</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              if (window.confirm("Discard draft?")) {
                localStorage.removeItem(DRAFT_KEY);
                setForm({ ...emptyCountingForm, locationId: activeLocationId || "" });
              }
            }}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
          >
            Discard Draft
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-brand-700"
          >
            <Save size={18} />
            Submit Count
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Form Area */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Location & Context">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Select Location</label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={form.locationId}
                    onChange={e => setForm({ ...form, locationId: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                  >
                    <option value="">Choose a location...</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-xl bg-amber-50 p-3 border border-amber-100 flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  <strong>Important:</strong> Changing the location will update the system quantities for products to match the selected location.
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Products to Count">
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
                    placeholder="Search products in this location..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm outline-none focus:border-brand-500 transition shadow-sm"
                  />
                  {productFocus && filteredProducts.length > 0 && (
                    <div className="absolute top-full z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
                      {filteredProducts.map(p => (
                        <button
                          key={p.id}
                          onMouseDown={() => addLine(p)}
                          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-brand-50 transition"
                        >
                          <div>
                            <p className="text-sm font-bold text-ink">{p.name}</p>
                            <p className="text-xs text-slate-500">System Qty: {p.stock_quantity}</p>
                          </div>
                          <Plus size={18} className="text-brand-500" />
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
                    <th className="pb-4">System Qty</th>
                    <th className="pb-4">Counted Qty</th>
                    <th className="pb-4">Adjustment</th>
                    <th className="pb-4">Reason</th>
                    <th className="pb-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {form.lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center text-slate-400">
                        <History size={40} className="mx-auto mb-3 opacity-20" />
                        <p>Search and add products to count</p>
                      </td>
                    </tr>
                  ) : (
                    form.lines.map(line => (
                      <tr key={line.id} className="group transition hover:bg-slate-50/50">
                        <td className="py-4 pl-2">
                          <p className="font-bold text-ink">{line.name}</p>
                        </td>
                        <td className="py-4 font-mono text-slate-500">
                          {line.stockQty}
                        </td>
                        <td className="py-4">
                          <input
                            type="number"
                            min="0"
                            value={line.countedQty}
                            onChange={e => updateLine(line.id, { countedQty: parseInt(e.target.value) || 0 })}
                            className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 font-black outline-none focus:border-brand-500"
                          />
                        </td>
                        <td className="py-4">
                          <select
                            value={line.mode}
                            onChange={e => updateLine(line.id, { mode: e.target.value as CountMode })}
                            className={`rounded-lg border px-3 py-2 font-bold outline-none ${
                              line.mode === "Add" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100"
                            }`}
                          >
                            <option value="Add">Add (+)</option>
                            <option value="Subtract">Subtract (-)</option>
                          </select>
                        </td>
                        <td className="py-4">
                          <select
                            value={line.reason}
                            onChange={e => updateLine(line.id, { reason: e.target.value })}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
                          >
                            <option value="correction">Stock Correction</option>
                            <option value="wastage">Wastage / Damage</option>
                            <option value="expiry">Expired</option>
                            <option value="return">Customer Return</option>
                          </select>
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

        {/* Sidebar */}
        <div className="space-y-6">
          <SectionCard title="Count Summary">
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Total Items</span>
                <span className="font-bold text-ink">{form.lines.length}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Adjustment Type</span>
                <span className="font-bold text-emerald-600">Manual Count</span>
              </div>
              
              <div className="pt-4 border-t border-slate-100">
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Internal Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-brand-500 h-40 resize-none"
                  placeholder="Describe the reason for this count (e.g., Monthly inventory audit)..."
                />
              </div>
            </div>
          </SectionCard>

          <div className="rounded-[2rem] bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white shadow-xl">
            <h3 className="text-lg font-bold">Need Help?</h3>
            <p className="mt-2 text-sm text-brand-100 leading-relaxed">
              Stock counting updates the actual inventory levels in the database. Use 'Add' to increase stock (e.g. found items) or 'Subtract' to decrease stock (e.g. damages).
            </p>
          </div>
        </div>
      </div>

      <QuickAddProductModal
        isOpen={quickProductOpen}
        onClose={() => setQuickProductOpen(false)}
        onSuccess={() => {
          if (form.locationId) {
            listPosProducts(form.locationId, 1000).then(setProducts);
          }
          setQuickProductOpen(false);
        }}
      />
    </div>
  );
}
