import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, PackageX, FileText, CheckCircle2,
  Building2, Plus, Calendar, User, Trash2, ArrowLeft,
  RefreshCcw, AlertTriangle, TrendingDown, DollarSign, Flame
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { listPosProducts } from "../services/posService";
import { listLocations } from "../services/settingsService";
import {
  recordStockLossOrExpense, listStockLossesAndExpenses,
  type StockLossRecord, type LossOrExpenseType
} from "../services/stockService";
import { formatCurrency } from "../lib/format";
import { SectionCard } from "../components/ui/SectionCard";
import type { LocationRecord } from "../types/database";
import type { PosProductRecord } from "../types/database";

type SelectionItem = {
  productId: string;
  productName: string;
  availableStock: number;
  unitCost: number;
  quantity: number;
  category: LossOrExpenseType;
  notes: string;
};

const CATEGORY_CONFIG: Record<LossOrExpenseType, { label: string; badge: string; dot: string }> = {
  expired:  { label: "Expired",  badge: "bg-rose-100 text-rose-700 border-rose-200",   dot: "bg-rose-500"    },
  damage:   { label: "Damaged",  badge: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500"  },
  expense:  { label: "Expense",  badge: "bg-blue-100 text-blue-700 border-blue-200",   dot: "bg-blue-500"   },
};

export function StockLossExpensePage() {
  const navigate = useNavigate();
  const { profile, business, activeLocationId, assignedLocations, can } = useAuth();
  const { showToast } = useNotification();

  const [activeTab, setActiveTab] = useState<"new" | "history">("new");
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [products, setProducts] = useState<PosProductRecord[]>([]);
  const [records, setRecords] = useState<StockLossRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [productSearch, setProductSearch] = useState<string>("");
  const [selectedItems, setSelectedItems] = useState<SelectionItem[]>([]);

  // History Filters
  const [historySearch, setHistorySearch] = useState<string>("");
  const [historyCategory, setHistoryCategory] = useState<string>("all");

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const history = await listStockLossesAndExpenses();
      setRecords(Array.isArray(history) ? history : []);
    } catch (err) {
      console.error("Failed to load stock loss history:", err);
      setRecords([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    try {
      const locs = await listLocations(business?.id);
      const locsArr = Array.isArray(locs) ? locs : [];
      const assignedArr = Array.isArray(assignedLocations) ? assignedLocations : [];
      const availableLocs = (locsArr.length ? locsArr : assignedArr) as LocationRecord[];
      setLocations(availableLocs);
      if (availableLocs.length && !selectedLocationId) {
        setSelectedLocationId(activeLocationId || availableLocs[0]?.id || "");
      }
    } catch (err) {
      console.error("Failed to load locations:", err);
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, [business?.id, assignedLocations, activeLocationId, selectedLocationId]);

  useEffect(() => {
    void loadLocations();
    void loadHistory();
  }, []);

  useEffect(() => {
    if (activeLocationId && !selectedLocationId) {
      setSelectedLocationId(activeLocationId);
    }
  }, [activeLocationId]);

  useEffect(() => {
    if (selectedLocationId) {
      listPosProducts(selectedLocationId, 1000)
        .then((res) => setProducts(Array.isArray(res) ? res : []))
        .catch((err) => {
          console.error("Failed loading products for location:", err);
          setProducts([]);
        });
    }
  }, [selectedLocationId]);

  const filteredProducts = (products || []).filter(p =>
    p?.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p?.barcode && p.barcode.toLowerCase().includes(productSearch.toLowerCase()))
  );

  const handleAddProduct = (product: PosProductRecord) => {
    const existingIndex = (selectedItems || []).findIndex(i => i.productId === product.id);
    if (existingIndex > -1) {
      const updated = [...selectedItems];
      if (updated[existingIndex].quantity < product.stock_quantity) {
        updated[existingIndex].quantity += 1;
        setSelectedItems(updated);
        showToast("info", `Updated quantity for ${product.name}`);
      } else {
        showToast("warning", `Cannot exceed available stock (${product.stock_quantity})`);
      }
    } else {
      setSelectedItems(prev => [...prev, {
        productId: product.id,
        productName: product.name,
        availableStock: product.stock_quantity,
        unitCost: (product as any).cost_price || product.selling_price || 0,
        quantity: 1,
        category: "expired",
        notes: "",
      }]);
      showToast("success", `${product.name} added to write-off table`);
    }
    setProductSearch("");
  };

  const handleRemoveItem = (index: number) => {
    setSelectedItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateItem = <K extends keyof SelectionItem>(
    index: number, field: K, value: SelectionItem[K]
  ) => {
    setSelectedItems(prev => {
      const updated = [...prev];
      updated[index][field] = value;
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can("Stock Loss", "add")) { showToast("error", "You do not have permission to record stock losses"); return; }
    if (!selectedLocationId) { showToast("error", "Please select a location"); return; }
    if ((selectedItems || []).length === 0) { showToast("error", "No products in write-off table"); return; }
    const missingNotes = selectedItems.some(i => !i.notes.trim());
    if (missingNotes) { showToast("error", "Please fill in reason notes for every item"); return; }
    
    // In demo mode, provide fallback IDs
    const userId = profile?.id || "demo-user-id";
    const bizId = business?.id || "demo-business-id";

    setSubmitting(true);
    try {
      for (const item of selectedItems) {
        await recordStockLossOrExpense({
          locationId: selectedLocationId,
          businessId: bizId,
          createdBy: userId,
          productId: item.productId,
          quantity: Number(item.quantity),
          category: item.category,
          notes: item.notes.trim(),
        });
      }
      showToast("success", `${selectedItems.length} item(s) written off and removed from stock!`);
      setSelectedItems([]);
      await loadHistory();
      setActiveTab("history");
    } catch (err: any) {
      showToast("error", "Failed to submit: " + (err?.message || "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRecords = (records || []).filter(r => {
    const q = historySearch.toLowerCase();
    const matchesSearch = !q ||
      r?.productName?.toLowerCase().includes(q) ||
      r?.notes?.toLowerCase().includes(q) ||
      r?.createdBy?.toLowerCase().includes(q) ||
      r?.locationName?.toLowerCase().includes(q);
    const matchesCat = historyCategory === "all" || r?.category === historyCategory;
    return matchesSearch && matchesCat;
  });

  const totalWastedValue = (records || [])
    .filter(r => r?.category === "expired" || r?.category === "damage")
    .reduce((s, r) => s + (Number(r?.totalLossAmount) || 0), 0);

  const totalExpenseValue = (records || [])
    .filter(r => r?.category === "expense")
    .reduce((s, r) => s + (Number(r?.totalLossAmount) || 0), 0);

  const totalSelectionValue = (selectedItems || []).reduce((s, i) => s + (Number(i?.quantity) || 0) * (Number(i?.unitCost) || 0), 0);

  return (
    <div className="space-y-6">

      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/sales")}
            className="rounded-2xl bg-white p-3 text-slate-600 shadow-soft transition hover:bg-slate-50"
            title="Back to Sales"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">
              Stock Management
            </p>
            <h2 className="mt-1 text-2xl font-black text-ink">
              Expenses, Damage &amp; Expired Products
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab("new")}
            className={`flex items-center gap-2 rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === "new"
                ? "bg-rose-600 text-white shadow-lg shadow-rose-200"
                : "bg-white text-slate-600 shadow-soft hover:bg-slate-50"
            }`}
          >
            <Plus size={15} /> Write-Off Form
          </button>
          <button
            onClick={() => {
              setActiveTab("history");
              void loadHistory();
            }}
            className={`flex items-center gap-2 rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === "history"
                ? "bg-brand-600 text-white shadow-lg shadow-brand-200"
                : "bg-white text-slate-600 shadow-soft hover:bg-slate-50"
            }`}
          >
            <FileText size={15} /> History
            {records.length > 0 && (
              <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
                activeTab === "history" ? "bg-white/20 text-white" : "bg-brand-100 text-brand-700"
              }`}>
                {records.length}
              </span>
            )}
          </button>
          <button
            onClick={() => void loadHistory()}
            className="rounded-2xl bg-white p-3 text-brand-600 shadow-soft transition hover:bg-brand-50"
            title="Refresh history"
          >
            <RefreshCcw size={17} className={historyLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── SUMMARY STAT CARDS (always visible) ─────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            label: "Total Wasted Value",
            sub: "Expired + Damaged",
            value: totalWastedValue,
            icon: PackageX,
            bg: "bg-rose-50",
            iconBg: "bg-rose-500",
            textColor: "text-rose-700",
            valueColor: "text-rose-900",
          },
          {
            label: "Total Expense Value",
            sub: "Products used as expense",
            value: totalExpenseValue,
            icon: DollarSign,
            bg: "bg-blue-50",
            iconBg: "bg-blue-500",
            textColor: "text-blue-700",
            valueColor: "text-blue-900",
          },
          {
            label: "Total All Write-offs",
            sub: "Combined losses",
            value: totalWastedValue + totalExpenseValue,
            icon: TrendingDown,
            bg: "bg-amber-50",
            iconBg: "bg-amber-500",
            textColor: "text-amber-700",
            valueColor: "text-amber-900",
          },
        ].map(({ label, sub, value, icon: Icon, bg, iconBg, textColor, valueColor }) => (
          <div key={label} className={`flex items-center gap-5 rounded-3xl border border-slate-100 ${bg} p-5 shadow-soft`}>
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${iconBg} text-white shadow-md`}>
              <Icon size={24} />
            </div>
            <div>
              <p className={`text-xs font-black uppercase tracking-wider ${textColor}`}>{label}</p>
              <p className="text-[11px] font-semibold text-slate-500">{sub}</p>
              <p className={`mt-1 text-xl font-black ${valueColor}`}>{formatCurrency(value)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── TAB CONTENT ─────────────────────────────────────────────── */}
      {activeTab === "new" ? (

        <div className="space-y-6">

          {/* Location + Product Search */}
          <SectionCard title="Select Location &amp; Search Product" subtitle="Choose the branch then search for the product to add to the write-off table">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">

              {/* Location */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  <Building2 size={13} /> Target Location
                </label>
                <div className="relative">
                  <Building2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={selectedLocationId}
                    onChange={e => setSelectedLocationId(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-ink outline-none focus:border-brand-500 transition"
                  >
                    <option value="" disabled>Select Location...</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Product Search */}
              <div className="md:col-span-2 space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  <Search size={13} /> Search Product to Write Off
                </label>
                <div className="relative">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Type product name or barcode..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-ink outline-none focus:border-brand-500 transition"
                  />
                </div>
              </div>
            </div>

            {/* Search Dropdown Results */}
            {productSearch.trim() !== "" && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-soft">
                <p className="border-b border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Click a product to add it to the write-off table ↓
                </p>
                {filteredProducts.length === 0 ? (
                  <p className="p-6 text-center text-sm font-semibold text-slate-400">
                    No matching products found for this location.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2 lg:grid-cols-3">
                    {filteredProducts.slice(0, 30).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleAddProduct(p)}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-brand-400 hover:shadow-soft active:scale-[0.98]"
                      >
                        <div>
                          <p className="text-sm font-black text-ink">{p.name}</p>
                          <p className="text-[11px] font-semibold text-slate-400">
                            {p.barcode || "No barcode"}
                          </p>
                        </div>
                        <div className="ml-3 shrink-0 text-right">
                          <span className={`inline-block rounded-lg px-2.5 py-1 text-xs font-black ${
                            p.stock_quantity > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}>
                            {p.stock_quantity} in stock
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* Write-off Table */}
          <SectionCard
            title={`Write-Off Selection Table (${selectedItems.length} item${selectedItems.length !== 1 ? "s" : ""})`}
            subtitle="Review and confirm the products to remove from stock. All fields are required."
          >
            {selectedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-400">
                  <PackageX size={28} />
                </div>
                <h4 className="text-sm font-black text-slate-700">No Items Added Yet</h4>
                <p className="mt-1 max-w-sm text-xs font-semibold text-slate-400">
                  Search for a product above and click on it to add it to this table.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/10 bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-[10px] font-black uppercase tracking-widest text-slate-100">
                        <th className="px-4 py-3.5">Product Name</th>
                        <th className="px-4 py-3.5">Category</th>
                        <th className="px-4 py-3.5 text-center">In Stock</th>
                        <th className="px-4 py-3.5 text-center">Qty to Remove</th>
                        <th className="px-4 py-3.5 text-right">Unit Cost</th>
                        <th className="px-4 py-3.5 text-right">Total Value</th>
                        <th className="px-4 py-3.5">Reason Notes</th>
                        <th className="px-4 py-3.5 text-center">Del</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedItems.map((item, idx) => {
                        const lineTotal = item.quantity * item.unitCost;
                        const cfg = CATEGORY_CONFIG[item.category];
                        return (
                          <tr key={idx} className="group transition hover:bg-brand-50/30">
                            <td className="px-4 py-3 font-black text-ink">
                              {item.productName}
                            </td>

                            <td className="px-4 py-3">
                              <select
                                value={item.category}
                                onChange={e => handleUpdateItem(idx, "category", e.target.value as LossOrExpenseType)}
                                className={`rounded-xl border px-3 py-1.5 text-xs font-black outline-none transition ${cfg.badge}`}
                              >
                                <option value="expired">Expired</option>
                                <option value="damage">Damaged</option>
                                <option value="expense">Expense</option>
                              </select>
                            </td>

                            <td className="px-4 py-3 text-center text-sm font-bold text-slate-500">
                              {item.availableStock}
                            </td>

                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => item.quantity > 1 && handleUpdateItem(idx, "quantity", item.quantity - 1)}
                                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 font-black text-slate-600 transition hover:bg-slate-200"
                                >−</button>
                                <input
                                  type="number"
                                  min="1"
                                  max={item.availableStock}
                                  value={item.quantity}
                                  onChange={e => handleUpdateItem(idx, "quantity", Math.max(1, Number(e.target.value)))}
                                  className="w-14 rounded-xl border border-slate-200 py-1.5 text-center text-sm font-black outline-none focus:border-brand-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => item.quantity < item.availableStock && handleUpdateItem(idx, "quantity", item.quantity + 1)}
                                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 font-black text-slate-600 transition hover:bg-slate-200"
                                >+</button>
                              </div>
                            </td>

                            <td className="px-4 py-3 text-right text-sm font-semibold text-slate-600">
                              {formatCurrency(item.unitCost)}
                            </td>

                            <td className="px-4 py-3 text-right text-sm font-black text-ink">
                              {formatCurrency(lineTotal)}
                            </td>

                            <td className="px-4 py-3">
                              <input
                                type="text"
                                placeholder="Reason / notes..."
                                value={item.notes}
                                onChange={e => handleUpdateItem(idx, "notes", e.target.value)}
                                className={`w-full rounded-xl border px-3 py-1.5 text-xs font-bold outline-none transition ${
                                  !item.notes.trim()
                                    ? "border-rose-300 bg-rose-50 placeholder-rose-300 focus:border-rose-500"
                                    : "border-slate-200 bg-white focus:border-brand-500"
                                }`}
                              />
                            </td>

                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td colSpan={5} className="px-4 py-3 text-right text-xs font-black uppercase tracking-wider text-slate-500">
                          Total Write-Off Value:
                        </td>
                        <td className="px-4 py-3 text-right text-lg font-black text-ink">
                          {formatCurrency(totalSelectionValue)}
                        </td>
                        <td colSpan={2} className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedItems([])}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-500 transition hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600"
                          >
                            Clear All
                          </button>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Submit */}
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-end">
                  <div className="flex items-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs font-bold text-amber-700">
                    <AlertTriangle size={16} />
                    This will permanently remove the quantities from stock. This cannot be undone.
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !can("Stock Loss", "add")}
                    className="flex shrink-0 items-center gap-2 rounded-2xl bg-rose-600 px-8 py-3.5 text-sm font-black text-white shadow-xl shadow-rose-200 transition hover:bg-rose-700 active:scale-95 disabled:opacity-60"
                  >
                    {submitting ? (
                      <>
                        <RefreshCcw size={16} className="animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        Submit &amp; Remove from Stock
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

      ) : (

        /* ── HISTORY TAB ─────────────────────────────────────────────── */
        <div className="space-y-5">

          {/* Filters */}
          <div className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-soft sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by product, user, location, notes..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-ink outline-none focus:border-brand-500 focus:bg-white transition"
              />
            </div>
            <select
              value={historyCategory}
              onChange={e => setHistoryCategory(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-ink outline-none focus:border-brand-500 sm:w-48"
            >
              <option value="all">All Categories</option>
              <option value="expired">Expired Only</option>
              <option value="damage">Damaged Only</option>
              <option value="expense">Expense Only</option>
            </select>
            <button
              onClick={() => void loadHistory()}
              disabled={historyLoading}
              className="flex shrink-0 items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-brand-600 shadow-soft transition hover:bg-brand-50"
            >
              <RefreshCcw size={16} className={historyLoading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {/* Table */}
          <SectionCard
            title={`Write-Off History (${filteredRecords.length} record${filteredRecords.length !== 1 ? "s" : ""})`}
            subtitle="All recorded stock losses, damages, expired items and expenses"
          >
            {historyLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-400">
                  <FileText size={28} />
                </div>
                <h4 className="text-sm font-black text-slate-700">No Records Found</h4>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {historySearch || historyCategory !== "all"
                    ? "Try clearing your filters."
                    : "Submit your first write-off using the form above."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/10 bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-[10px] font-black uppercase tracking-widest text-slate-100">
                      <th className="px-4 py-3.5">Date &amp; Time</th>
                      <th className="px-4 py-3.5">Who Made It</th>
                      <th className="px-4 py-3.5">Location</th>
                      <th className="px-4 py-3.5">Product</th>
                      <th className="px-4 py-3.5">Category</th>
                      <th className="px-4 py-3.5 text-center">Quantity</th>
                      <th className="px-4 py-3.5 text-right">Unit Cost</th>
                      <th className="px-4 py-3.5 text-right">Total Loss</th>
                      <th className="px-4 py-3.5">Reason Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecords.map(rec => {
                      const cfg = CATEGORY_CONFIG[rec.category];
                      return (
                        <tr key={rec.id} className="transition hover:bg-brand-50/20">
                          <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-slate-500">
                            <span className="flex items-center gap-1.5">
                              <Calendar size={13} className="text-slate-400" />
                              {rec.createdAt}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                              <User size={13} className="text-slate-400" />
                              {rec.createdBy}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-slate-500">
                            {rec.locationName}
                          </td>
                          <td className="px-4 py-3 text-sm font-black text-ink">
                            {rec.productName}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${cfg.badge}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-black text-ink">
                            {rec.quantity}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-slate-600">
                            {rec.unitCost > 0 ? formatCurrency(rec.unitCost) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-black text-rose-700">
                            {formatCurrency(rec.totalLossAmount)}
                          </td>
                          <td className="max-w-[180px] truncate px-4 py-3 text-xs font-medium text-slate-600" title={rec.notes}>
                            {rec.notes}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={7} className="px-4 py-3 text-right text-xs font-black uppercase tracking-wider text-slate-500">
                        Grand Total Loss Shown:
                      </td>
                      <td className="px-4 py-3 text-right text-base font-black text-rose-700">
                        {formatCurrency(filteredRecords.reduce((s, r) => s + r.totalLossAmount, 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
