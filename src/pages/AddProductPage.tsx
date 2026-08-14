import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Save,
  Package,
  Layers,
  DollarSign,
  Barcode,
  Loader2,
  Plus,
  Box,
  Percent,
  Minus,
  Lock,
  AlertTriangle,
  CheckCircle2,
  MapPin,
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
  listCategories,
  getProductLocations,
} from "../services/productService";
import { listLocations } from "../services/settingsService";
import { formatCurrency } from "../lib/format";

type BulkPricingMode = "fixed" | "discount_amount" | "discount_percentage";

type ProductForm = {
  name: string;
  categoryId: string;
  barcode: string;
  costPrice: string;
  sellingPrice: string;
  imageUrl: string;
  reorderLevel: string;
  // Bulk pricing
  bulkEnabled: boolean;
  bulkQuantity: string;
  bulkPricingMode: BulkPricingMode;
  bulkFixedPrice: string;       // total price for the whole box (fixed mode)
  bulkDiscountValue: string;    // discount amount or percentage off total box price
  // Location availability
  allLocations: boolean;
  selectedLocationIds: string[];
};

const createEmptyForm = (): ProductForm => ({
  name: "",
  categoryId: "",
  barcode: "",
  costPrice: "",
  sellingPrice: "",
  imageUrl: "",
  reorderLevel: "5",
  bulkEnabled: false,
  bulkQuantity: "",
  bulkPricingMode: "fixed",
  bulkFixedPrice: "",
  bulkDiscountValue: "",
  allLocations: true,
  selectedLocationIds: [],
});

/** Compute the effective bulk (box) total price from form inputs */
function computeBulkTotal(
  mode: BulkPricingMode,
  bulkQty: number,
  unitPrice: number,
  fixedPrice: string,
  discountValue: string
): number | null {
  const totalListPrice = bulkQty * unitPrice;
  if (mode === "fixed") {
    const v = parseFloat(fixedPrice);
    return isNaN(v) || v <= 0 ? null : v;
  }
  if (mode === "discount_amount") {
    const disc = parseFloat(discountValue);
    if (isNaN(disc) || disc < 0) return null;
    return totalListPrice - disc;
  }
  if (mode === "discount_percentage") {
    const pct = parseFloat(discountValue);
    if (isNaN(pct) || pct < 0 || pct >= 100) return null;
    return totalListPrice * (1 - pct / 100);
  }
  return null;
}

export function AddProductPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useNotification();

  const DRAFT_KEY = `pos_product_draft_${profile?.id || "guest"}`;

  const [form, setForm] = useState<ProductForm>(() => {
    if (!id) {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          return createEmptyForm();
        }
      }
    }
    return createEmptyForm();
  });

  const { settings, loading: settingsLoading } = useSettings();
  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [lastComputedSellingPrice, setLastComputedSellingPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ─── Load data ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        const [cats, locs, allProds] = await Promise.all([
          listCategories(),
          listLocations(profile?.business_id),
          id ? listProducts() : Promise.resolve([]),
        ]);

        setCategories(cats);
        setLocations(locs);

        if (id) {
          const prod = allProds.find((p) => p.id === id);
          const assignedLocIds = await getProductLocations(id);
          const isAllLocs = assignedLocIds.length === 0 || (locs.length > 0 && assignedLocIds.length >= locs.length);

          if (prod) {
            const hasBulk = prod.bulk_quantity != null && prod.bulk_quantity > 0;
            setForm({
              name: prod.name,
              categoryId: prod.category_id || "",
              barcode: prod.barcode || "",
              costPrice: String(prod.cost_price || ""),
              sellingPrice: String(prod.selling_price || ""),
              imageUrl: prod.image_url || "",
              reorderLevel: String(prod.reorder_level || "5"),
              bulkEnabled: hasBulk,
              bulkQuantity: hasBulk ? String(prod.bulk_quantity) : "",
              bulkPricingMode: (prod.bulk_pricing_mode as BulkPricingMode) || "fixed",
              bulkFixedPrice:
                prod.bulk_pricing_mode === "fixed" && prod.bulk_price != null
                  ? String(prod.bulk_price)
                  : "",
              bulkDiscountValue:
                prod.bulk_discount_value != null ? String(prod.bulk_discount_value) : "",
              allLocations: isAllLocs,
              selectedLocationIds: assignedLocIds.length > 0 ? assignedLocIds : locs.map((l: any) => l.id),
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
  }, [id, profile?.business_id]);

  // ─── Suggested selling price ──────────────────────────────────────────────
  const defaultProfit = settings?.default_profit_percentage;
  const hasAdminProfit = typeof defaultProfit === "number";
  const costPriceNum = Number(form.costPrice || 0);
  const suggestedSellingPrice =
    hasAdminProfit && costPriceNum > 0
      ? Math.round(costPriceNum + (costPriceNum * defaultProfit) / 100)
      : 0;

  useEffect(() => {
    if (
      !id &&
      hasAdminProfit &&
      costPriceNum > 0 &&
      (!form.sellingPrice ||
        Number(form.sellingPrice) === lastComputedSellingPrice ||
        Number(form.sellingPrice) === 0)
    ) {
      setForm((prev) => ({
        ...prev,
        sellingPrice: suggestedSellingPrice ? String(suggestedSellingPrice) : prev.sellingPrice,
      }));
      setLastComputedSellingPrice(suggestedSellingPrice);
    }
  }, [costPriceNum, hasAdminProfit, suggestedSellingPrice, id, form.sellingPrice, lastComputedSellingPrice]);

  // ─── Draft autosave ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!id && !saving) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    }
  }, [form, id, saving]);

  // ─── Bulk pricing live calculations ──────────────────────────────────────
  const unitPrice = Number(form.sellingPrice || 0);
  const bulkQty = Number(form.bulkQuantity || 0);
  const totalListPrice = bulkQty * unitPrice;

  const computedBulkTotal = useMemo(() => {
    if (!form.bulkEnabled || bulkQty < 2 || unitPrice <= 0) return null;
    return computeBulkTotal(
      form.bulkPricingMode,
      bulkQty,
      unitPrice,
      form.bulkFixedPrice,
      form.bulkDiscountValue
    );
  }, [
    form.bulkEnabled,
    form.bulkPricingMode,
    form.bulkFixedPrice,
    form.bulkDiscountValue,
    bulkQty,
    unitPrice,
  ]);

  const bulkPricePerUnit =
    computedBulkTotal != null && bulkQty > 0 ? computedBulkTotal / bulkQty : null;

  const bulkSavings =
    computedBulkTotal != null && totalListPrice > 0
      ? totalListPrice - computedBulkTotal
      : null;

  // Loss prevention: bulk price must be < total list price
  const bulkIsValid =
    computedBulkTotal != null &&
    computedBulkTotal > 0 &&
    computedBulkTotal < totalListPrice;

  // Auto-recalculate fixed price warning when unit price changes
  const [prevUnitPrice, setPrevUnitPrice] = useState<number>(unitPrice);
  const fixedPriceOutOfSync =
    form.bulkEnabled &&
    form.bulkPricingMode === "fixed" &&
    form.bulkFixedPrice !== "" &&
    prevUnitPrice !== unitPrice &&
    unitPrice > 0;

  useEffect(() => {
    setPrevUnitPrice(unitPrice);
  }, [unitPrice]);

  // When using discount modes, update the stored discount value
  // and auto-recalculate so it re-uses the discount on price change
  function handleUnitPriceChange(newPrice: string) {
    setForm((prev) => {
      const newUnit = Number(newPrice || 0);
      const newBulkQty = Number(prev.bulkQuantity || 0);

      if (
        prev.bulkEnabled &&
        prev.bulkPricingMode === "fixed" &&
        prev.bulkFixedPrice &&
        newUnit > 0 &&
        newBulkQty > 0
      ) {
        // Auto-adjust fixed price: keep the same discount amount
        const oldUnit = Number(prev.sellingPrice || 0);
        const oldTotal = oldUnit * newBulkQty;
        const oldFixed = Number(prev.bulkFixedPrice);
        const oldDiscount = oldTotal - oldFixed;
        const newTotal = newUnit * newBulkQty;
        const newFixed = Math.max(0, newTotal - oldDiscount);
        return { ...prev, sellingPrice: newPrice, bulkFixedPrice: String(Math.round(newFixed)) };
      }

      return { ...prev, sellingPrice: newPrice };
    });
  }

  // ─── Save handler ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    const name = (form.name || "").trim();
    const sellingPrice = parseFloat(form.sellingPrice);
    const costPriceVal = parseFloat(form.costPrice) || 0;

    if (!name) { showToast("error", "⚠️ Product name is required"); return; }
    if (name.length < 2) { showToast("error", "⚠️ Product name must be at least 2 characters"); return; }
    if (costPriceVal < 0) { showToast("error", "⚠️ Cost price cannot be negative"); return; }
    if (!form.sellingPrice || sellingPrice <= 0) { showToast("error", "⚠️ Selling price must be greater than 0"); return; }
    if (costPriceVal > 0 && sellingPrice < costPriceVal) {
      showToast("warning", "⚠️ Selling price is below cost. Check the profit percentage or price input.");
      return;
    }

    // Bulk validation
    let finalBulkQty: number | null = null;
    let finalBulkPrice: number | null = null;
    let finalBulkMode: string | null = null;
    let finalBulkDiscountVal: number | null = null;

    if (form.bulkEnabled && bulkQty >= 2) {
      if (!bulkIsValid) {
        showToast("error", "⚠️ Bulk price must be less than the total list price, and greater than 0. Adjust your bulk pricing settings.");
        return;
      }
      finalBulkQty = bulkQty;
      finalBulkPrice = Math.round(computedBulkTotal!);
      finalBulkMode = form.bulkPricingMode;
      finalBulkDiscountVal = form.bulkDiscountValue ? parseFloat(form.bulkDiscountValue) : null;
    }

    if (!form.allLocations && form.selectedLocationIds.length === 0) {
      showToast("error", "⚠️ Please select at least one location for this product.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        category_id: form.categoryId || undefined,
        barcode: form.barcode || "",
        cost_price: costPriceVal,
        selling_price: sellingPrice,
        image_url: form.imageUrl || "",
        reorder_level: parseInt(form.reorderLevel) || 5,
        business_id: profile?.business_id || "",
        bulk_quantity: finalBulkQty,
        bulk_price: finalBulkPrice,
        bulk_pricing_mode: finalBulkMode as any,
        bulk_discount_value: finalBulkDiscountVal,
        all_locations: form.allLocations,
        location_ids: form.allLocations ? undefined : form.selectedLocationIds,
      };

      if (id) {
        await updateProduct(id, payload as any);
        showToast("success", "✓ Product updated successfully");
      } else {
        await createProduct(payload as any, profile?.business_id || "");
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

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20">
      {/* Header */}
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
          {/* ── Basic Information ── */}
          <SectionCard title="Basic Information">
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Product Name *</label>
                <div className="relative">
                  <Package size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Water Bottle 500ml"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                  />
                </div>
              </div>

              {/* Category + Barcode */}
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
                      onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                    >
                      <option value="">Select Category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  {creatingCategory && (
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
                          if (!newCategoryName.trim()) { showToast("error", "⚠️ Category name is required"); return; }
                          if (!profile?.business_id) { showToast("error", "⚠️ Business context is missing"); return; }
                          setCategorySaving(true);
                          try {
                            const category = await createCategory(newCategoryName.trim(), profile.business_id);
                            setCategories((cur) => [category, ...cur]);
                            setForm((cur) => ({ ...cur, categoryId: category.id }));
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
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Barcode / SKU</label>
                  <div className="relative">
                    <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={form.barcode}
                      onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                      placeholder="Scan or type barcode"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-500 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Cost Price */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Cost Price (FRW)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">FRW</span>
                  <input
                    type="number"
                    value={form.costPrice}
                    onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-12 pr-3 text-sm outline-none focus:border-brand-500 transition"
                  />
                </div>
              </div>

              {/* Selling Price */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Unit Selling Price (FRW) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-brand-600">FRW</span>
                  <input
                    type="number"
                    value={form.sellingPrice}
                    onChange={(e) => handleUnitPriceChange(e.target.value)}
                    className="w-full rounded-xl border border-brand-100 bg-brand-50 py-2.5 pl-12 pr-3 text-sm font-bold text-brand-700 outline-none focus:border-brand-500 transition"
                  />
                </div>
                {settingsLoading ? (
                  <p className="mt-2 text-sm text-slate-400">Loading admin profit setting...</p>
                ) : costPriceNum > 0 && hasAdminProfit ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Suggested ({defaultProfit}% profit):{" "}
                    <span className="font-semibold text-ink">{formatCurrency(suggestedSellingPrice)}</span>.{" "}
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, sellingPrice: String(suggestedSellingPrice) }))}
                      className="font-semibold text-brand-600 underline"
                    >
                      Use it
                    </button>
                  </p>
                ) : costPriceNum > 0 ? (
                  <p className="mt-2 text-sm text-amber-600">Set admin default profit in Settings for automatic price suggestions.</p>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">Enter cost price to see suggested selling price.</p>
                )}
              </div>

              {/* Reorder Level */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Reorder Level</label>
                <input
                  type="number"
                  value={form.reorderLevel}
                  onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-brand-500 transition"
                  placeholder="Notify me when stock reaches..."
                />
                <p className="mt-1 text-[10px] text-slate-400">Set to 0 to disable alerts</p>
              </div>
            </div>
          </SectionCard>

          {/* ── Location Availability ── */}
          <SectionCard title="Location Availability">
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Choose the locations where this product should be available for sale.
              </p>

              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2.5 text-sm font-semibold text-ink cursor-pointer">
                  <input
                    type="radio"
                    name="locationAvailability"
                    checked={form.allLocations}
                    onChange={() => setForm((f) => ({ ...f, allLocations: true }))}
                    className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Available in All Locations</span>
                </label>
                <label className="flex items-center gap-2.5 text-sm font-semibold text-ink cursor-pointer">
                  <input
                    type="radio"
                    name="locationAvailability"
                    checked={!form.allLocations}
                    onChange={() => setForm((f) => ({ ...f, allLocations: false }))}
                    className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Specific Locations Only</span>
                </label>
              </div>

              {!form.allLocations && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Select Available Locations:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {locations.map((loc) => {
                      const isChecked = form.selectedLocationIds.includes(loc.id);
                      return (
                        <label
                          key={loc.id}
                          className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition ${
                            isChecked
                              ? "border-brand-500 bg-brand-50 text-brand-900 font-semibold shadow-sm"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setForm((f) => ({
                                ...f,
                                selectedLocationIds: checked
                                  ? [...f.selectedLocationIds, loc.id]
                                  : f.selectedLocationIds.filter((lid) => lid !== loc.id),
                              }));
                            }}
                            className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                          />
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin size={16} className={isChecked ? "text-brand-600" : "text-slate-400"} />
                            <span>{loc.name}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {form.selectedLocationIds.length === 0 && (
                    <p className="text-xs text-rose-600 font-semibold mt-1">
                      ⚠️ Please select at least one location.
                    </p>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          {/* ── Bulk / Box Pricing ── */}
          <div className="rounded-3xl border-2 border-dashed border-brand-200 bg-gradient-to-br from-brand-50 to-sky-50 p-6 space-y-5">
            {/* Toggle header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-md">
                  <Box size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">Box / Bulk Pricing</h3>
                  <p className="text-xs text-slate-500">Sell cheaper when buying a full box. Auto-applied at checkout.</p>
                </div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={form.bulkEnabled}
                  onChange={(e) => setForm({ ...form, bulkEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all after:content-[''] peer-checked:bg-brand-500 peer-checked:after:translate-x-5" />
              </label>
            </div>

            {form.bulkEnabled && (
              <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Box Size */}
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Box Size (units per box) *
                  </label>
                  <input
                    type="number"
                    min="2"
                    value={form.bulkQuantity}
                    onChange={(e) => setForm({ ...form, bulkQuantity: e.target.value })}
                    placeholder="e.g. 12  (a box of 12 bottles)"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-bold outline-none focus:border-brand-500 transition"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Minimum 2 units to form a box.</p>
                </div>

                {/* Pricing Mode */}
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Pricing Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { value: "fixed", label: "Fixed Price", icon: Lock, desc: "Set the total box price directly" },
                        { value: "discount_amount", label: "Discount (FRW)", icon: Minus, desc: "Deduct a fixed amount from list price" },
                        { value: "discount_percentage", label: "Discount (%)", icon: Percent, desc: "Deduct a percentage from list price" },
                      ] as { value: BulkPricingMode; label: string; icon: any; desc: string }[]
                    ).map(({ value, label, icon: Icon, desc }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setForm({ ...form, bulkPricingMode: value })}
                        title={desc}
                        className={`flex flex-col items-center gap-1 rounded-2xl border-2 p-3 text-center text-xs font-bold transition ${
                          form.bulkPricingMode === value
                            ? "border-brand-500 bg-brand-500 text-white shadow-md"
                            : "border-slate-200 bg-white text-slate-500 hover:border-brand-200"
                        }`}
                      >
                        <Icon size={18} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fixed Price input */}
                {form.bulkPricingMode === "fixed" && (
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                      Box Total Price (FRW) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">FRW</span>
                      <input
                        type="number"
                        value={form.bulkFixedPrice}
                        onChange={(e) => setForm({ ...form, bulkFixedPrice: e.target.value })}
                        placeholder={bulkQty > 0 && unitPrice > 0 ? `List price: ${formatCurrency(totalListPrice)}` : "e.g. 11400"}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-12 pr-3 text-sm font-bold outline-none focus:border-brand-500 transition"
                      />
                    </div>
                    {bulkQty > 0 && unitPrice > 0 && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        List price for {bulkQty} units = <strong>{formatCurrency(totalListPrice)}</strong>. Box price must be less than this.
                      </p>
                    )}
                    {fixedPriceOutOfSync && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3">
                        <AlertTriangle size={14} className="mt-0.5 text-amber-500 shrink-0" />
                        <p className="text-xs text-amber-700">
                          The unit price changed — the box price has been auto-adjusted to maintain the same discount. Review the box price below.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Discount Amount input */}
                {form.bulkPricingMode === "discount_amount" && (
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                      Discount Amount per Box (FRW) *
                    </label>
                    <div className="relative">
                      <Minus size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="number"
                        min="0"
                        value={form.bulkDiscountValue}
                        onChange={(e) => setForm({ ...form, bulkDiscountValue: e.target.value })}
                        placeholder="e.g. 600  (600 FRW off the box)"
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-bold outline-none focus:border-brand-500 transition"
                      />
                    </div>
                    {bulkQty > 0 && unitPrice > 0 && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Box list price = {formatCurrency(totalListPrice)}. Box will sell for{" "}
                        <strong>
                          {form.bulkDiscountValue
                            ? formatCurrency(Math.max(0, totalListPrice - parseFloat(form.bulkDiscountValue || "0")))
                            : "—"}
                        </strong>
                        .
                      </p>
                    )}
                  </div>
                )}

                {/* Discount Percentage input */}
                {form.bulkPricingMode === "discount_percentage" && (
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                      Discount Percentage off Box Price *
                    </label>
                    <div className="relative">
                      <Percent size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={form.bulkDiscountValue}
                        onChange={(e) => setForm({ ...form, bulkDiscountValue: e.target.value })}
                        placeholder="e.g. 5  (5% off the full box price)"
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-bold outline-none focus:border-brand-500 transition"
                      />
                    </div>
                    {bulkQty > 0 && unitPrice > 0 && form.bulkDiscountValue && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        {parseFloat(form.bulkDiscountValue)}% off {formatCurrency(totalListPrice)} ={" "}
                        <strong>{formatCurrency(totalListPrice * (1 - parseFloat(form.bulkDiscountValue) / 100))}</strong> per box.
                      </p>
                    )}
                  </div>
                )}

                {/* Live preview card */}
                {computedBulkTotal != null && bulkQty >= 2 && unitPrice > 0 && (
                  <div
                    className={`rounded-2xl border p-4 ${
                      bulkIsValid
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-rose-200 bg-rose-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      {bulkIsValid ? (
                        <CheckCircle2 size={16} className="text-emerald-600" />
                      ) : (
                        <AlertTriangle size={16} className="text-rose-600" />
                      )}
                      <p className={`text-xs font-bold uppercase tracking-wider ${bulkIsValid ? "text-emerald-700" : "text-rose-700"}`}>
                        {bulkIsValid ? "Bulk Pricing Preview" : "⚠️ Invalid — Bulk price exceeds list price"}
                      </p>
                    </div>
                    {bulkIsValid && (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Unit price (1 piece)</span>
                          <span className="font-bold text-ink">{formatCurrency(unitPrice)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Box size</span>
                          <span className="font-bold text-ink">{bulkQty} units</span>
                        </div>
                        <div className="border-t border-slate-200 my-1" />
                        <div className="flex justify-between">
                          <span className="text-slate-600">Box list price ({bulkQty} × {formatCurrency(unitPrice)})</span>
                          <span className="text-slate-500">{formatCurrency(totalListPrice)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-700 font-semibold">Box bulk price</span>
                          <span className="font-bold text-emerald-700">{formatCurrency(computedBulkTotal)}</span>
                        </div>
                        {bulkPricePerUnit != null && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">Effective price per unit in box</span>
                            <span className="font-bold text-brand-700">{formatCurrency(bulkPricePerUnit)}</span>
                          </div>
                        )}
                        {bulkSavings != null && bulkSavings > 0 && (
                          <div className="flex justify-between rounded-xl bg-emerald-100 px-3 py-2 mt-1">
                            <span className="text-emerald-800 font-semibold">Customer saves per box</span>
                            <span className="font-bold text-emerald-800">-{formatCurrency(bulkSavings)}</span>
                          </div>
                        )}
                        <div className="mt-3 rounded-xl bg-white border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
                          <p className="font-bold text-slate-700 mb-1">Example — Customer buys 13 units:</p>
                          <div className="flex justify-between">
                            <span>📦 1 box ({bulkQty} units)</span>
                            <span className="font-semibold">{formatCurrency(computedBulkTotal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>🧩 {13 % bulkQty} loose unit{13 % bulkQty !== 1 ? "s" : ""}</span>
                            <span className="font-semibold">{formatCurrency((13 % bulkQty) * unitPrice)}</span>
                          </div>
                          <div className="border-t border-slate-200 flex justify-between pt-1 font-bold">
                            <span>Total</span>
                            <span>{formatCurrency(computedBulkTotal + (13 % bulkQty) * unitPrice)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {!bulkIsValid && (
                      <p className="text-sm text-rose-700">
                        Computed box price (<strong>{formatCurrency(computedBulkTotal)}</strong>) must be less than the list price (<strong>{formatCurrency(totalListPrice)}</strong>) and greater than 0.
                        Adjust your discount or box size.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column — tips */}
        <div className="space-y-4">
          <div className="rounded-3xl bg-indigo-900 p-8 text-white shadow-xl overflow-hidden relative">
            <div className="absolute -right-8 -bottom-8 opacity-10">
              <Package size={160} />
            </div>
            <h3 className="text-lg font-bold relative z-10">Pro Tip</h3>
            <p className="mt-2 text-sm text-indigo-200 leading-relaxed relative z-10">
              Accurate cost prices let the system calculate your real profit margins automatically.
            </p>
          </div>

          <div className="rounded-3xl bg-sky-900 p-6 text-white shadow-xl overflow-hidden relative">
            <div className="absolute -right-6 -bottom-6 opacity-10">
              <Box size={120} />
            </div>
            <h3 className="text-base font-bold relative z-10">How Bulk Pricing Works</h3>
            <ul className="mt-3 space-y-2 text-xs text-sky-200 leading-relaxed relative z-10 list-disc pl-4">
              <li>Set how many units make <strong className="text-white">1 box</strong></li>
              <li>Choose a pricing mode: <strong className="text-white">Fixed</strong>, <strong className="text-white">Discount Amount</strong>, or <strong className="text-white">Discount %</strong></li>
              <li>At checkout the system auto-splits: <strong className="text-white">boxes + loose pieces</strong></li>
              <li>Changing unit price with Fixed mode will <strong className="text-white">auto-adjust</strong> the box price, preserving your discount</li>
              <li>Box price is always kept <strong className="text-white">below full list price</strong> to prevent losses</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
