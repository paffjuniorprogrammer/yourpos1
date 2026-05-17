import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { 
  ArrowLeft, 
  Save, 
  Package, 
  Tag, 
  Layers, 
  DollarSign, 
  Barcode, 
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  Plus,
  Trash2
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useSettings } from "../hooks/useSettings";
import { SectionCard } from "../components/ui/SectionCard";
import { 
  createCategory,
  createProduct, 
  updateProduct, 
  listProducts,
  listCategories
} from "../services/productService";
import { listSuppliers } from "../services/supplierService";
import { formatCurrency } from "../lib/format";

type ProductForm = {
  name: string;
  categoryId: string;
  barcode: string;
  costPrice: string;
  sellingPrice: string;
  imageUrl: string;
  reorderLevel: string;
};

const createEmptyForm = (): ProductForm => ({
  name: "",
  categoryId: "",
  barcode: "",
  costPrice: "",
  sellingPrice: "",
  imageUrl: "",
  reorderLevel: "5",
});

export function AddProductPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useNotification();

  const DRAFT_KEY = `pos_product_draft_${profile?.id || 'guest'}`;

  const [form, setForm] = useState<ProductForm>(() => {
    if (!id) {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { return createEmptyForm(); }
      }
    }
    return createEmptyForm();
  });

  const { settings, loading: settingsLoading } = useSettings();
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [lastComputedSellingPrice, setLastComputedSellingPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [cats, sups, allProds] = await Promise.all([
          listCategories(),
          listSuppliers(),
          id ? listProducts() : Promise.resolve([])
        ]);
        
        setCategories(cats);
        setSuppliers(sups);

        if (id) {
          const prod = allProds.find(p => p.id === id);
          if (prod) {
            setForm({
              name: prod.name,
              categoryId: prod.category_id || "",
              barcode: prod.barcode || "",
              costPrice: String(prod.cost_price || ""),
              sellingPrice: String(prod.selling_price || ""),
              imageUrl: prod.image_url || "",
              reorderLevel: String(prod.reorder_level || "5"),
            });
          }
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const defaultProfit = settings?.default_profit_percentage;
  const hasAdminProfit = typeof defaultProfit === "number";
  const costPrice = Number(form.costPrice || 0);
  const suggestedSellingPrice = hasAdminProfit && costPrice > 0 ? Math.round(costPrice + costPrice * defaultProfit / 100) : 0;

  useEffect(() => {
    if (!id && hasAdminProfit && costPrice > 0 && (!form.sellingPrice || Number(form.sellingPrice) === lastComputedSellingPrice || Number(form.sellingPrice) === 0)) {
      setForm(prev => ({ ...prev, sellingPrice: suggestedSellingPrice ? String(suggestedSellingPrice) : prev.sellingPrice }));
      setLastComputedSellingPrice(suggestedSellingPrice);
    }
  }, [costPrice, hasAdminProfit, suggestedSellingPrice, id, form.sellingPrice, lastComputedSellingPrice]);

  useEffect(() => {
    if (!id && !saving) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    }
  }, [form, id, saving]);

  const handleSave = async () => {
    // Comprehensive validation
    const name = (form.name || '').trim();
    const sellingPrice = parseFloat(form.sellingPrice);
    const costPrice = parseFloat(form.costPrice) || 0;

    if (!name) {
      showToast("error", "⚠️ Product name is required");
      return;
    }

    if (name.length < 2) {
      showToast("error", "⚠️ Product name must be at least 2 characters");
      return;
    }

    if (costPrice < 0) {
      showToast("error", "⚠️ Cost price cannot be negative");
      return;
    }

    if (!form.sellingPrice || sellingPrice <= 0) {
      showToast("error", "⚠️ Selling price must be greater than 0");
      return;
    }

    if (costPrice > 0 && sellingPrice < costPrice) {
      showToast("warning", "⚠️ Selling price is below cost. Check the profit percentage or price input.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        category_id: form.categoryId || undefined,
        barcode: form.barcode || '',
        cost_price: costPrice,
        selling_price: sellingPrice,
        image_url: form.imageUrl || '',
        reorder_level: parseInt(form.reorderLevel) || 5,
        business_id: profile?.business_id || ''
      };

      if (id) {
        await updateProduct(id, payload);
        showToast("success", "✓ Product updated successfully");
      } else {
        await createProduct(payload as any, profile?.business_id || '');
        showToast("success", "✓ Product created successfully");
        localStorage.removeItem(DRAFT_KEY);
      }
      navigate("/products");
    } catch (error: any) {
      const message = error.message || "Failed to save product";
      showToast("error", `⚠️ ${message}`);
      console.error("Save error:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setForm(prev => ({ ...prev, imageUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate("/products")}
            className="rounded-xl bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-ink">{id ? "Edit Product" : "New Product"}</h1>
            <p className="text-slate-500">Manage catalog information and pricing</p>
          </div>
        </div>

        <div className="flex gap-3">
          {!id && (
            <button
              onClick={() => {
                if (window.confirm("Clear all fields?")) {
                  localStorage.removeItem(DRAFT_KEY);
                  setForm(createEmptyForm());
                }
              }}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              Discard Draft
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {id ? "Update Product" : "Save Product"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Basic Information">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Product Name *</label>
                <div className="relative">
                  <Package size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. BlueBand Milk 1L"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Category</label>
                    <button
                      type="button"
                      onClick={() => setCreatingCategory(true)}
                      className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700 transition hover:bg-brand-100"
                    >
                      <Plus size={12} /> Add Category
                    </button>
                  </div>
                  <div className="relative">
                    <Layers size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      value={form.categoryId}
                      onChange={e => setForm({ ...form, categoryId: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                    >
                      <option value="">Select Category</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  {creatingCategory ? (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="New category name"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (!newCategoryName.trim()) {
                            showToast("error", "⚠️ Category name is required");
                            return;
                          }
                          if (!profile?.business_id) {
                            showToast("error", "⚠️ Business context is missing");
                            return;
                          }
                          setCategorySaving(true);
                          try {
                            const category = await createCategory(newCategoryName.trim(), profile.business_id);
                            setCategories((current) => [category, ...current]);
                            setForm((current) => ({ ...current, categoryId: category.id }));
                            setCreatingCategory(false);
                            setNewCategoryName("");
                            showToast("success", "✓ Category created successfully");
                          } catch (error: any) {
                            showToast("error", `⚠️ ${error?.message || "Failed to create category"}`);
                          } finally {
                            setCategorySaving(false);
                          }
                        }}
                        disabled={categorySaving}
                        className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Barcode / SKU</label>
                  <div className="relative">
                    <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={form.barcode}
                      onChange={e => setForm({ ...form, barcode: e.target.value })}
                      placeholder="Scan or type barcode"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                    />
                  </div>
                </div>
              </div>

              <div>

                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Cost Price</label>
                <div className="relative">
                  <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    value={form.costPrice}
                    onChange={e => setForm({ ...form, costPrice: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Selling Price *</label>
                <div className="relative">
                  <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    value={form.sellingPrice}
                    onChange={e => setForm({ ...form, sellingPrice: e.target.value })}
                    className="w-full rounded-xl border border-brand-100 bg-brand-50 py-2.5 pl-10 pr-3 text-sm font-bold text-brand-700 outline-none focus:border-brand-500 transition"
                  />
                </div>
                {settingsLoading ? (
                  <p className="mt-2 text-sm text-slate-400">Loading admin profit setting...</p>
                ) : costPrice > 0 && hasAdminProfit ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Suggested price based on the admin default profit ({defaultProfit}%): <span className="font-semibold text-ink">{formatCurrency(suggestedSellingPrice)}</span>.
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, sellingPrice: String(suggestedSellingPrice) }))}
                      className="ml-2 font-semibold text-brand-600 underline"
                    >
                      Use suggested price
                    </button>
                  </p>
                ) : costPrice > 0 ? (
                  <p className="mt-2 text-sm text-amber-600">Set the admin default profit in Settings to enable automatic price suggestions.</p>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">Enter cost price to see the suggested selling price.</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Reorder Level</label>
                <input
                  type="number"
                  value={form.reorderLevel}
                  onChange={e => setForm({ ...form, reorderLevel: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-brand-500 transition"
                  placeholder="Notify me when stock reaches..."
                />
                <p className="mt-1 text-[10px] text-slate-400">Set to 0 to disable alerts</p>
              </div>
            </div>
          </SectionCard>

          <div className="rounded-3xl bg-indigo-900 p-8 text-white shadow-xl overflow-hidden relative">
            <div className="absolute -right-8 -bottom-8 opacity-10">
              <Package size={160} />
            </div>
            <h3 className="text-lg font-bold relative z-10">Pro Tip</h3>
            <p className="mt-2 text-sm text-indigo-200 leading-relaxed relative z-10">
              Entering accurate cost prices helps the system calculate your real profit margins automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
