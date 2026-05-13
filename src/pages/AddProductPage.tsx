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
import { SectionCard } from "../components/ui/SectionCard";
import { 
  createProduct, 
  updateProduct, 
  listProducts,
  listCategories
} from "../services/productService";
import { listSuppliers } from "../services/supplierService";

type ProductForm = {
  name: string;
  categoryId: string;
  barcode: string;
  costPrice: string;
  sellingPrice: string;
  sku: string;
  description: string;
  imageUrl: string;
  reorderLevel: string;
  unit: string;
  supplierId: string;
};

const createEmptyForm = (): ProductForm => ({
  name: "",
  categoryId: "",
  barcode: "",
  costPrice: "",
  sellingPrice: "",
  sku: "",
  description: "",
  imageUrl: "",
  reorderLevel: "5",
  unit: "pcs",
  supplierId: "",
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

  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
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
              sku: prod.sku || "",
              description: prod.description || "",
              imageUrl: prod.image_url || "",
              reorderLevel: String(prod.reorder_level || "5"),
              unit: prod.unit || "pcs",
              supplierId: prod.supplier_id || "",
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

  useEffect(() => {
    if (!id && !saving) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    }
  }, [form, id, saving]);

  const handleSave = async () => {
    if (!form.name || !form.sellingPrice) {
      showToast("error", "Name and Selling Price are required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        category_id: form.categoryId || null,
        barcode: form.barcode,
        cost_price: parseFloat(form.costPrice) || 0,
        selling_price: parseFloat(form.sellingPrice) || 0,
        sku: form.sku,
        description: form.description,
        image_url: form.imageUrl,
        reorder_level: parseInt(form.reorderLevel) || 5,
        unit: form.unit,
        supplier_id: form.supplierId || null,
        business_id: profile?.business_id
      };

      if (id) {
        await updateProduct(id, payload);
        showToast("success", "Product updated successfully");
      } else {
        await createProduct(payload as any);
        showToast("success", "Product created successfully");
        localStorage.removeItem(DRAFT_KEY);
      }
      navigate("/products");
    } catch (error: any) {
      showToast("error", error.message || "Failed to save product");
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
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Category</label>
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
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  placeholder="Tell more about this product..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-brand-500 transition resize-none"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Pricing & Units">
            <div className="grid gap-4 md:grid-cols-3">
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
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Unit</label>
                <select
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-brand-500 transition"
                >
                  <option value="pcs">Pieces (pcs)</option>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="ltr">Liters (ltr)</option>
                  <option value="box">Box</option>
                  <option value="pack">Pack</option>
                </select>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Product Media">
            <div className="space-y-4">
              <div className="aspect-square w-full overflow-hidden rounded-2xl bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center relative group">
                {form.imageUrl ? (
                  <>
                    <img src={form.imageUrl} alt="Product" className="h-full w-full object-cover" />
                    <button 
                      onClick={() => setForm({...form, imageUrl: ""})}
                      className="absolute top-2 right-2 p-1.5 bg-white/80 rounded-lg text-rose-600 opacity-0 group-hover:opacity-100 transition shadow-sm"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                ) : (
                  <div className="text-center p-6">
                    <ImageIcon size={40} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-xs text-slate-400">Click below to upload photo</p>
                  </div>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="product-image-upload"
              />
              <label 
                htmlFor="product-image-upload"
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                <Plus size={18} />
                {form.imageUrl ? "Change Photo" : "Upload Photo"}
              </label>
            </div>
          </SectionCard>

          <SectionCard title="Inventory Settings">
            <div className="space-y-4">
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

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Preferred Supplier</label>
                <select
                  value={form.supplierId}
                  onChange={e => setForm({ ...form, supplierId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-brand-500 transition"
                >
                  <option value="">No preference</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
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
