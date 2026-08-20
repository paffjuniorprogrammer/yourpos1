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
  Sparkles,
  Calculator,
  Tag,
  HelpCircle,
  Info,
  TrendingDown,
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
  bulkFixedPrice: string;       // price for one piece when sold as part of a box
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
                prod.bulk_pricing_mode === "fixed" && prod.bulk_price != null && prod.bulk_quantity
                  ? String(Number(prod.bulk_price) / Number(prod.bulk_quantity))
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

  function handleCostPriceChange(newCost: string) {
    const costNum = Number(newCost || 0);
    const newSuggested =
      hasAdminProfit && costNum > 0
        ? Math.round(costNum + (costNum * defaultProfit) / 100)
        : 0;

    setForm((prev) => {
      const shouldAutoFill =
        !id &&
        hasAdminProfit &&
        costNum > 0 &&
        (!prev.sellingPrice ||
          Number(prev.sellingPrice) === lastComputedSellingPrice ||
          Number(prev.sellingPrice) === 0);

      return {
        ...prev,
        costPrice: newCost,
        sellingPrice: shouldAutoFill && newSuggested > 0 ? String(newSuggested) : prev.sellingPrice,
      };
    });

    if (newSuggested > 0) {
      setLastComputedSellingPrice(newSuggested);
    }
  }

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
  const fixedBoxTotal = bulkQty * Number(form.bulkFixedPrice || 0);

  const computedBulkTotal = useMemo(() => {
    if (!form.bulkEnabled || bulkQty < 2 || unitPrice <= 0) return null;
    return computeBulkTotal(
      form.bulkPricingMode,
      bulkQty,
      unitPrice,
      form.bulkPricingMode === "fixed" ? String(fixedBoxTotal) : form.bulkFixedPrice,
      form.bulkDiscountValue
    );
  }, [
    form.bulkEnabled,
    form.bulkPricingMode,
    fixedBoxTotal,
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

  const savingsPercentage =
    bulkSavings != null && totalListPrice > 0
      ? Math.round((bulkSavings / totalListPrice) * 1000) / 10
      : 0;

  // Interactive quantity test in preview
  const [testQty, setTestQty] = useState<number>(13);
  useEffect(() => {
    if (bulkQty >= 2) {
      setTestQty(bulkQty + 1);
    }
  }, [bulkQty]);

  const testPackages = bulkQty > 0 ? Math.floor(testQty / bulkQty) : 0;
  const testRemaining = bulkQty > 0 ? testQty % bulkQty : testQty;
  const testBoxCost = testPackages * (computedBulkTotal || 0);
  const testLooseCost = testRemaining * unitPrice;
  const testTotalCost = testBoxCost + testLooseCost;
  const testListCost = testQty * unitPrice;
  const testTotalSavings = testListCost > testTotalCost ? testListCost - testTotalCost : 0;

  // Handler for setting total box price directly
  function handleBoxTotalChange(val: string) {
    const total = parseFloat(val);
    if (!isNaN(total) && total > 0 && bulkQty > 0) {
      const perPiece = total / bulkQty;
      setForm((prev) => ({ ...prev, bulkFixedPrice: String(Math.round(perPiece * 100) / 100) }));
    } else if (val === "") {
      setForm((prev) => ({ ...prev, bulkFixedPrice: "" }));
    }
  }

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
        // Keep the same discount per piece when the normal unit price changes.
        const oldUnit = Number(prev.sellingPrice || 0);
        const oldBoxUnit = Number(prev.bulkFixedPrice);
        const discountPerPiece = oldUnit - oldBoxUnit;
        const newBoxUnit = Math.max(0, newUnit - discountPerPiece);
        return { ...prev, sellingPrice: newPrice, bulkFixedPrice: String(Math.round(newBoxUnit)) };
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
                    onChange={(e) => handleCostPriceChange(e.target.value)}
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
          <div className="rounded-3xl border-2 border-brand-200 bg-gradient-to-br from-brand-50/70 via-white to-sky-50/60 p-6 space-y-6 shadow-sm">
            {/* Toggle header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-md">
                  <Box size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-ink">Box / Wholesale Bulk Pricing</h3>
                    <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[10px] font-black text-brand-700 uppercase tracking-wider">
                      Wholesale Deal
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Offer a discounted price when customers buy a full package or box. Automatically applied at checkout.
                  </p>
                </div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center shrink-0">
                <input
                  type="checkbox"
                  checked={form.bulkEnabled}
                  onChange={(e) => setForm({ ...form, bulkEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all after:content-[''] peer-checked:bg-brand-600 peer-checked:after:translate-x-5" />
              </label>
            </div>

            {form.bulkEnabled && (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Step 1: Box Size */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span>📦 Box Size (Units per Box) *</span>
                    </label>
                    <span className="text-[11px] font-semibold text-brand-600">e.g. 6, 12, 24, 48</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="2"
                      value={form.bulkQuantity}
                      onChange={(e) => setForm({ ...form, bulkQuantity: e.target.value })}
                      placeholder="e.g. 12 (12 bottles per box/crate)"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-4 text-sm font-bold text-ink outline-none focus:border-brand-500 focus:bg-white transition"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Info size={13} className="text-slate-400 shrink-0" />
                    <span>Minimum 2 units to form a bulk box. Customers buying this quantity or multiples get the special rate.</span>
                  </p>
                </div>

                {/* Step 2: Pricing Mode Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Tag size={14} className="text-brand-600" />
                    <span>How do you want to set the box discount?</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {(
                      [
                        {
                          value: "fixed",
                          label: "Box Piece Price",
                          icon: Lock,
                          desc: "Set the price per piece inside a box (or total box price)",
                        },
                        {
                          value: "discount_amount",
                          label: "Discount Amount (FRW)",
                          icon: Minus,
                          desc: "Deduct a fixed amount (FRW) off the full box price",
                        },
                        {
                          value: "discount_percentage",
                          label: "Discount Percentage (%)",
                          icon: Percent,
                          desc: "Deduct a percentage off the full box price",
                        },
                      ] as { value: BulkPricingMode; label: string; icon: any; desc: string }[]
                    ).map(({ value, label, icon: Icon, desc }) => {
                      const isSelected = form.bulkPricingMode === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setForm({ ...form, bulkPricingMode: value })}
                          className={`flex flex-col items-start gap-1 rounded-2xl border-2 p-3.5 text-left transition ${
                            isSelected
                              ? "border-brand-500 bg-brand-50/80 text-brand-900 shadow-sm"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <div className={`p-1.5 rounded-lg ${isSelected ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                              <Icon size={15} />
                            </div>
                            <span className="text-xs font-black truncate">{label}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-snug">{desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 3: Pricing Input Controls */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-4 shadow-xs">
                  {/* Fixed Piece / Total Box Inputs */}
                  {form.bulkPricingMode === "fixed" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Piece Price inside Box */}
                        <div>
                          <label className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-700">
                            Price per Piece in Box *
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">FRW</span>
                            <input
                              type="number"
                              value={form.bulkFixedPrice}
                              onChange={(e) => setForm({ ...form, bulkFixedPrice: e.target.value })}
                              placeholder={unitPrice > 0 ? `e.g. ${Math.round(unitPrice * 0.95)}` : "e.g. 2400"}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-12 pr-3 text-sm font-black text-ink outline-none focus:border-brand-500 focus:bg-white transition"
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-slate-400">
                            Normal unit price: <span className="font-bold text-slate-600">{formatCurrency(unitPrice)}</span>
                          </p>
                        </div>

                        {/* Full Box Total Price */}
                        <div>
                          <label className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-700">
                            Total Full Box Price (FRW)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">FRW</span>
                            <input
                              type="number"
                              value={bulkQty > 0 && form.bulkFixedPrice ? String(fixedBoxTotal) : ""}
                              onChange={(e) => handleBoxTotalChange(e.target.value)}
                              placeholder={totalListPrice > 0 ? `e.g. ${Math.round(totalListPrice * 0.95)}` : "e.g. 28800"}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-12 pr-3 text-sm font-black text-emerald-700 outline-none focus:border-brand-500 focus:bg-white transition"
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-slate-400">
                            Normal box list: <span className="font-bold text-slate-600">{formatCurrency(totalListPrice)}</span>
                          </p>
                        </div>
                      </div>

                      {fixedPriceOutOfSync && (
                        <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3">
                          <AlertTriangle size={15} className="mt-0.5 text-amber-500 shrink-0" />
                          <p className="text-xs text-amber-800">
                            The unit price changed — the box piece price was auto-adjusted to preserve your discount. Please verify the box price above.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Discount Amount input */}
                  {form.bulkPricingMode === "discount_amount" && (
                    <div>
                      <label className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-700">
                        Discount Amount per Box (FRW) *
                      </label>
                      <div className="relative">
                        <Minus size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="number"
                          min="0"
                          value={form.bulkDiscountValue}
                          onChange={(e) => setForm({ ...form, bulkDiscountValue: e.target.value })}
                          placeholder="e.g. 1200 (1,200 FRW off full box list price)"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-3 text-sm font-black text-ink outline-none focus:border-brand-500 focus:bg-white transition"
                        />
                      </div>
                      {bulkQty > 0 && unitPrice > 0 && (
                        <p className="mt-1.5 text-xs text-slate-600">
                          Normal box list = <strong>{formatCurrency(totalListPrice)}</strong>. Box will sell for{" "}
                          <strong className="text-emerald-700">
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
                      <label className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-700">
                        Discount Percentage off Full Box (%) *
                      </label>
                      <div className="relative">
                        <Percent size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="number"
                          min="0"
                          max="99"
                          value={form.bulkDiscountValue}
                          onChange={(e) => setForm({ ...form, bulkDiscountValue: e.target.value })}
                          placeholder="e.g. 5 (5% off full box price)"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-3 text-sm font-black text-ink outline-none focus:border-brand-500 focus:bg-white transition"
                        />
                      </div>
                      {bulkQty > 0 && unitPrice > 0 && form.bulkDiscountValue && (
                        <p className="mt-1.5 text-xs text-slate-600">
                          {parseFloat(form.bulkDiscountValue)}% off {formatCurrency(totalListPrice)} ={" "}
                          <strong className="text-emerald-700">
                            {formatCurrency(totalListPrice * (1 - parseFloat(form.bulkDiscountValue) / 100))}
                          </strong>{" "}
                          per box.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Step 4: Live Preview & POS Simulator Card */}
                {computedBulkTotal != null && bulkQty >= 2 && unitPrice > 0 && (
                  <div
                    className={`rounded-3xl border p-5 space-y-4 shadow-sm transition ${
                      bulkIsValid
                        ? "border-emerald-200 bg-emerald-50/70"
                        : "border-rose-200 bg-rose-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {bulkIsValid ? (
                          <CheckCircle2 size={18} className="text-emerald-600" />
                        ) : (
                          <AlertTriangle size={18} className="text-rose-600" />
                        )}
                        <h4 className={`text-xs font-black uppercase tracking-wider ${bulkIsValid ? "text-emerald-800" : "text-rose-800"}`}>
                          {bulkIsValid ? "Bulk Pricing Breakdown & Savings" : "⚠️ Invalid Bulk Configuration"}
                        </h4>
                      </div>
                      {bulkIsValid && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-black text-emerald-800">
                          <Sparkles size={12} /> Auto-applied at POS
                        </span>
                      )}
                    </div>

                    {bulkIsValid ? (
                      <div className="space-y-3">
                        {/* Summary Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                          <div className="rounded-2xl bg-white/80 border border-emerald-100 p-2.5">
                            <span className="text-[10px] font-bold uppercase text-slate-500 block">Unit Price (1 pc)</span>
                            <span className="text-sm font-black text-ink">{formatCurrency(unitPrice)}</span>
                          </div>
                          <div className="rounded-2xl bg-white/80 border border-emerald-100 p-2.5">
                            <span className="text-[10px] font-bold uppercase text-slate-500 block">Box Size</span>
                            <span className="text-sm font-black text-ink">{bulkQty} units</span>
                          </div>
                          <div className="rounded-2xl bg-white/80 border border-emerald-100 p-2.5">
                            <span className="text-[10px] font-bold uppercase text-slate-500 block">Normal Box List</span>
                            <span className="text-sm font-bold text-slate-400 line-through">{formatCurrency(totalListPrice)}</span>
                          </div>
                          <div className="rounded-2xl bg-white/80 border border-emerald-200 p-2.5 bg-gradient-to-br from-emerald-50 to-white">
                            <span className="text-[10px] font-black uppercase text-emerald-700 block">Box Bulk Price</span>
                            <span className="text-sm font-black text-emerald-700">{formatCurrency(computedBulkTotal)}</span>
                          </div>
                        </div>

                        {/* Customer Savings Highlight Bar */}
                        {bulkSavings != null && bulkSavings > 0 && (
                          <div className="flex items-center justify-between rounded-2xl bg-emerald-600 text-white px-4 py-3 shadow-sm">
                            <div className="flex items-center gap-2">
                              <TrendingDown size={18} />
                              <span className="text-xs font-black uppercase tracking-wider">Customer Savings per Box</span>
                            </div>
                            <span className="text-sm font-black">
                              +{formatCurrency(bulkSavings)} ({savingsPercentage}% off)
                            </span>
                          </div>
                        )}

                        {/* Interactive POS Checkout Simulator */}
                        <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2">
                              <Calculator size={16} className="text-brand-600" />
                              <span className="text-xs font-black text-ink">Test POS Checkout Simulator:</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setTestQty((q) => Math.max(1, q - 1))}
                                className="h-7 w-7 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-black flex items-center justify-center text-xs"
                              >
                                -
                              </button>
                              <span className="w-12 text-center text-xs font-black text-ink">{testQty} pcs</span>
                              <button
                                type="button"
                                onClick={() => setTestQty((q) => q + 1)}
                                className="h-7 w-7 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-black flex items-center justify-center text-xs"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1.5 text-xs text-slate-600">
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-700">
                                📦 {testPackages} Box{testPackages !== 1 ? "es" : ""} ({testPackages * bulkQty} units @ {formatCurrency(computedBulkTotal)}/box)
                              </span>
                              <span className="font-bold text-ink">{formatCurrency(testBoxCost)}</span>
                            </div>
                            {testRemaining > 0 && (
                              <div className="flex justify-between">
                                <span className="font-semibold text-slate-700">
                                  🧩 {testRemaining} Loose Unit{testRemaining !== 1 ? "s" : ""} (@ {formatCurrency(unitPrice)} each)
                                </span>
                                <span className="font-bold text-ink">{formatCurrency(testLooseCost)}</span>
                              </div>
                            )}
                            <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-sm font-black text-ink">
                              <span>Total POS Charge:</span>
                              <div className="text-right">
                                <span className="text-emerald-700 font-black text-base">{formatCurrency(testTotalCost)}</span>
                                {testTotalSavings > 0 && (
                                  <span className="block text-[10px] font-bold text-emerald-600">
                                    Saved {formatCurrency(testTotalSavings)} compared to loose price
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs font-bold text-rose-700 leading-relaxed">
                        Computed box price ({formatCurrency(computedBulkTotal)}) must be lower than normal list price ({formatCurrency(totalListPrice)}) and greater than 0. Please adjust the price or discount.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column — tips & guidance */}
        <div className="space-y-4">
          <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl overflow-hidden relative border border-slate-800">
            <div className="absolute -right-6 -bottom-6 opacity-10">
              <Box size={140} />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500 text-white">
                <Sparkles size={16} />
              </div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white">How Bulk Deals Work</h3>
            </div>
            <ul className="space-y-3 text-xs text-slate-300 leading-relaxed relative z-10">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-400 font-black text-[10px]">1</span>
                <span><strong className="text-white">Define Box Size:</strong> Enter the package quantity (e.g. 12 bottles in 1 crate).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-400 font-black text-[10px]">2</span>
                <span><strong className="text-white">Set Box Price:</strong> Set discounted price per piece, fixed box discount, or percentage.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-400 font-black text-[10px]">3</span>
                <span><strong className="text-white">Auto-Split at POS:</strong> Cashiers simply enter total pieces (e.g. 13). The POS charges 1 full box + 1 loose unit automatically!</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-400 font-black text-[10px]">4</span>
                <span><strong className="text-white">Loss Protection:</strong> The system ensures wholesale prices are always lower than retail list price.</span>
              </li>
            </ul>
          </div>

          <div className="rounded-3xl bg-gradient-to-br from-indigo-900 to-indigo-950 p-6 text-white shadow-xl overflow-hidden relative border border-indigo-800/50">
            <div className="absolute -right-8 -bottom-8 opacity-10">
              <Package size={140} />
            </div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Profit & Stock Advice</h3>
            <p className="mt-2 text-xs text-indigo-200 leading-relaxed relative z-10">
              Setting cost prices accurately ensures your POS and Reports calculate accurate gross margins for both retail units and wholesale packages.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
