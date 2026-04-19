import { useState, useEffect } from "react";
import { X, Box, Save } from "lucide-react";
import { createProduct, listCategories } from "../../services/productService";
import type { Category } from "../../types/database";
import { getShopSettingsRecord } from "../../services/settingsService";
import { useNotification } from "../../context/NotificationContext";
import { useAuth } from "../../context/AuthContext";
import { usePosData } from "../../context/PosDataContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (product: any) => void;
}

export function QuickAddProductModal({ isOpen, onClose, onSuccess }: Props) {
  const { showToast } = useNotification();
  const { activeLocationId } = useAuth();
  const { refreshData } = usePosData();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [profitPercent, setProfitPercent] = useState(30);
  const [manualPrice, setManualPrice] = useState(false);

  const [form, setForm] = useState({
    name: "",
    barcode: "",
    category_id: "",
    cost_price: "",
    selling_price: "",
    stock_quantity: "0",
    reorder_level: "5",
    measurement: "piece" as "kg" | "piece",
  });

  useEffect(() => {
    if (isOpen) {
      loadInitialData();
      setManualPrice(false);
    }
  }, [isOpen]);

  async function loadInitialData() {
    try {
      setLoading(true);
      const [cats, settings] = await Promise.all([
        listCategories(),
        getShopSettingsRecord()
      ]);
      setCategories(cats);
      if (settings) {
        setProfitPercent(settings.default_profit_percentage || 30);
      }
    } catch (err) {
      console.error("Failed to load initial data:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleCostOrProfitChange(nextCost: string, nextProfit: number) {
    setForm(f => ({ ...f, cost_price: nextCost }));
    setProfitPercent(nextProfit);

    if (!manualPrice) {
      const cost = Number(nextCost || 0);
      setForm(f => ({ ...f, selling_price: String(Math.round(cost + cost * (nextProfit / 100))) }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.selling_price) {
      showToast("error", "Name and Price are required.");
      return;
    }

    try {
      setSubmitting(true);
      const newProduct = await createProduct({
        ...form,
        cost_price: Number(form.cost_price),
        selling_price: Number(form.selling_price),
        stock_quantity: Number(form.stock_quantity),
        reorder_level: Number(form.reorder_level),
        image_url: "",
      }, activeLocationId);
      
      await refreshData();
      
      showToast("success", "Product created successfully!");
      onSuccess(newProduct);
      onClose();
      // Reset form
      setForm({
        name: "",
        barcode: "",
        category_id: "",
        cost_price: "",
        selling_price: "",
        stock_quantity: "0",
        reorder_level: "5",
        measurement: "piece",
      });
      setManualPrice(false);
    } catch (err) {
      console.error("Failed to create product:", err);
      showToast("error", "Failed to create product.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 transition-all backdrop-blur-sm" onClick={onClose}>
      <div 
        className="w-full max-w-2xl overflow-hidden rounded-[2.5rem] bg-white shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Box size={24} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600">Quick Inventory</p>
              <h2 className="text-2xl font-black text-ink">New Product Registry</h2>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 hover:text-ink">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <label className="block rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Product Name</span>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Fresh Milk"
                  className="mt-2 w-full border-none bg-transparent text-sm font-bold text-ink outline-none"
                />
              </label>

              <label className="block rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Category</span>
                <select
                  value={form.category_id}
                  onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                  className="mt-2 w-full border-none bg-transparent text-sm font-bold text-ink outline-none"
                >
                  <option value="">Select Category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-4">
                 <label className="block rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                   <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">Cost Price</span>
                   <input
                     type="number"
                     value={form.cost_price}
                     onChange={e => handleCostOrProfitChange(e.target.value, profitPercent)}
                     placeholder="0"
                     className="mt-2 w-full border-none bg-transparent text-sm font-bold text-ink outline-none"
                   />
                 </label>
                 <label className="block rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
                   <span className="text-xs font-bold uppercase tracking-widest text-brand-600">Selling Price</span>
                   <input
                     required
                     type="number"
                     value={form.selling_price}
                     onChange={e => {
                       setManualPrice(true);
                       setForm(f => ({ ...f, selling_price: e.target.value }));
                     }}
                     placeholder="0"
                     className="mt-2 w-full border-none bg-transparent text-sm font-bold text-ink outline-none"
                   />
                 </label>
              </div>

              <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-widest text-brand-600">Profit % (Admin Default)</span>
                    <p className="mt-1 text-xs text-brand-600/80">Auto-calculates selling price</p>
                  </div>
                  <input
                    type="number"
                    value={profitPercent}
                    onChange={e => handleCostOrProfitChange(form.cost_price, Number(e.target.value || 0))}
                    className="w-20 rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm font-bold text-ink outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
                 <label className="block rounded-2xl border border-slate-100 bg-slate-50 p-4">
                   <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Barcode / SKU</span>
                   <input
                     value={form.barcode}
                     onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                     placeholder="Optional"
                     className="mt-2 w-full border-none bg-transparent text-sm font-bold text-ink outline-none"
                   />
                 </label>

                 <div className="grid grid-cols-2 gap-4">
                    <label className="block rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Initial Stock</span>
                      <input
                        type="number"
                        value={form.stock_quantity}
                        onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))}
                        className="mt-2 w-full border-none bg-transparent text-sm font-bold text-ink outline-none"
                      />
                    </label>
                    <label className="block rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Low Stock Alert</span>
                      <input
                        type="number"
                        value={form.reorder_level}
                        onChange={e => setForm(f => ({ ...f, reorder_level: e.target.value }))}
                        className="mt-2 w-full border-none bg-transparent text-sm font-bold text-ink outline-none"
                      />
                    </label>
                 </div>

                 <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
                   <span className="text-xs font-bold uppercase tracking-widest text-violet-600">Measurement Unit</span>
                   <div className="mt-4 flex gap-4">
                      {['piece', 'kg'].map(u => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, measurement: u as any }))}
                          className={`flex-1 rounded-xl py-2 text-xs font-bold uppercase tracking-widest transition ${form.measurement === u ? 'bg-violet-600 text-white shadow-md' : 'bg-white text-violet-400 border border-violet-100'}`}
                        >
                          {u}
                        </button>
                      ))}
                   </div>
                 </div>
            </div>
          </div>

          <div className="mt-10 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl bg-slate-100 py-4 font-bold text-slate-600 transition hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-2 flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-8 py-4 font-bold text-white shadow-xl transition hover:bg-black disabled:opacity-50 active:scale-95"
            >
              {submitting ? "Registering..." : (
                <>
                  <Save size={18} />
                  <span>Finalize & Register</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
