import React, { useEffect, useState } from "react";
import { X, Search, AlertTriangle, PackageX, FileText, CheckCircle2, DollarSign, Building2, Plus, Calendar, User } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useNotification } from "../../context/NotificationContext";
import { listPosProducts } from "../../services/posService";
import { listLocations } from "../../services/settingsService";
import { recordStockLossOrExpense, listStockLossesAndExpenses, type StockLossRecord, type LossOrExpenseType } from "../../services/stockService";
import { formatCurrency } from "../../lib/format";
import type { LocationRecord, PosProductRecord } from "../../types/database";

interface StockLossExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const StockLossExpenseModal: React.FC<StockLossExpenseModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { profile, business, activeLocationId, assignedLocations } = useAuth();
  const { showToast } = useNotification();

  const [activeTab, setActiveTab] = useState<"record" | "history">("record");
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [products, setProducts] = useState<PosProductRecord[]>([]);
  const [records, setRecords] = useState<StockLossRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<number | "">(1);
  const [category, setCategory] = useState<LossOrExpenseType>("expired");
  const [notes, setNotes] = useState<string>("");
  const [productSearch, setProductSearch] = useState<string>("");

  // History Filters
  const [historySearch, setHistorySearch] = useState<string>("");
  const [historyCategory, setHistoryCategory] = useState<string>("all");

  useEffect(() => {
    if (!isOpen) return;
    loadLocationsAndRecords();
  }, [isOpen]);

  useEffect(() => {
    if (activeLocationId && !selectedLocationId) {
      setSelectedLocationId(activeLocationId);
    }
  }, [activeLocationId]);

  useEffect(() => {
    if (selectedLocationId) {
      void loadProductsForLocation(selectedLocationId);
    }
  }, [selectedLocationId]);

  const loadLocationsAndRecords = async () => {
    setLoading(true);
    try {
      const [locs, history] = await Promise.all([
        listLocations(business?.id),
        listStockLossesAndExpenses()
      ]);
      const availableLocs = (locs.length ? locs : assignedLocations) as LocationRecord[];
      setLocations(availableLocs);
      setRecords(history);

      if (availableLocs.length && !selectedLocationId) {
        setSelectedLocationId(availableLocs[0].id);
      }
    } catch (err) {
      console.error("Failed to load initial loss/expense data:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadProductsForLocation = async (locId: string) => {
    try {
      const prods = await listPosProducts(locId, 1000);
      setProducts(prods);
    } catch (err) {
      console.error("Failed to load products for location:", err);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.barcode && p.barcode.toLowerCase().includes(productSearch.toLowerCase()))
  );

  const selectedProduct = products.find(p => p.id === selectedProductId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedLocationId) {
      showToast("error", "Hitamo ahantu (Location)");
      return;
    }
    if (!selectedProductId) {
      showToast("error", "Hitamo ibicuruzwa (Product)");
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      showToast("error", "Shyiramo umubare ukwiriye (Quantity)");
      return;
    }
    if (!notes.trim()) {
      showToast("error", "Andika impamvu (Description / Notes)");
      return;
    }
    if (!profile?.id || !business?.id) {
      showToast("error", "User or Business ID missing");
      return;
    }

    setSubmitting(true);
    try {
      await recordStockLossOrExpense({
        locationId: selectedLocationId,
        businessId: business.id,
        createdBy: profile.id,
        productId: selectedProductId,
        quantity: Number(quantity),
        category,
        notes: notes.trim(),
      });

      showToast("success", "Ibicuruzwa byanditswe neza kandi bivuye mu stoke!");
      
      // Reset form fields
      setSelectedProductId("");
      setQuantity(1);
      setNotes("");
      setProductSearch("");

      // Refresh data
      await loadLocationsAndRecords();
      if (selectedLocationId) {
        await loadProductsForLocation(selectedLocationId);
      }

      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("Failed to submit stock loss record:", err);
      showToast("error", "Biyanze kwandikwa: " + (err?.message || "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRecords = records.filter(r => {
    const matchesSearch = r.productName.toLowerCase().includes(historySearch.toLowerCase()) ||
      r.notes.toLowerCase().includes(historySearch.toLowerCase()) ||
      r.createdBy.toLowerCase().includes(historySearch.toLowerCase()) ||
      r.locationName.toLowerCase().includes(historySearch.toLowerCase());

    const matchesCat = historyCategory === "all" || r.category === historyCategory;
    return matchesSearch && matchesCat;
  });

  const totalWastedValue = records
    .filter(r => r.category === "expired" || r.category === "damage")
    .reduce((sum, r) => sum + r.totalLossAmount, 0);

  const totalExpenseValue = records
    .filter(r => r.category === "expense")
    .reduce((sum, r) => sum + r.totalLossAmount, 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 text-amber-600 rounded-2xl">
              <PackageX size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Expenses, Damage & Expired Products</h3>
              <p className="text-xs font-bold text-slate-500">Kwandika ibyakoreshejwe, ibyangiritse cyangwa ibyarangiye no kuvanwa mu stoke</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-100 flex items-center gap-4 bg-white">
          <button
            onClick={() => setActiveTab("record")}
            className={`py-3.5 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "record"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            <Plus size={16} />
            Record New Loss / Expense
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`py-3.5 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "history"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            <FileText size={16} />
            History & Records ({records.length})
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === "record" ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Location Selection */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
                    <Building2 size={14} className="text-slate-400" />
                    Select Location (Ahantu)
                  </label>
                  <select
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                    className="w-full rounded-2xl border-slate-200 border bg-slate-50/50 p-3.5 text-sm font-bold text-slate-800 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition"
                  >
                    <option value="" disabled>Select Location...</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-slate-400" />
                    Category (Ubwoko)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setCategory("expired")}
                      className={`p-3 rounded-2xl font-black text-xs uppercase tracking-wider border flex flex-col items-center gap-1 transition-all ${
                        category === "expired"
                          ? "bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-500/20"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <PackageX size={16} />
                      Expired
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategory("damage")}
                      className={`p-3 rounded-2xl font-black text-xs uppercase tracking-wider border flex flex-col items-center gap-1 transition-all ${
                        category === "damage"
                          ? "bg-amber-50 border-amber-500 text-amber-700 ring-2 ring-amber-500/20"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <AlertTriangle size={16} />
                      Damaged
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategory("expense")}
                      className={`p-3 rounded-2xl font-black text-xs uppercase tracking-wider border flex flex-col items-center gap-1 transition-all ${
                        category === "expense"
                          ? "bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500/20"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <DollarSign size={16} />
                      Expense
                    </button>
                  </div>
                </div>

              </div>

              {/* Product Picker */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                  Select Product (Ibicuruzwa)
                </label>
                
                <div className="relative mb-3">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search product name or SKU..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full rounded-2xl border-slate-200 border bg-slate-50/50 pl-11 pr-4 py-3 text-sm font-bold text-slate-800 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100 bg-slate-50/30">
                  {filteredProducts.length === 0 ? (
                    <div className="p-6 text-center text-xs font-bold text-slate-400">
                      No products found for this location
                    </div>
                  ) : (
                    filteredProducts.map((p) => {
                      const isSelected = selectedProductId === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => setSelectedProductId(p.id)}
                          className={`p-3.5 flex items-center justify-between cursor-pointer transition-all ${
                            isSelected 
                              ? "bg-brand-50/80 text-brand-900 font-extrabold border-l-4 border-brand-600" 
                              : "hover:bg-slate-100/80 text-slate-700"
                          }`}
                        >
                          <div>
                            <p className="text-sm font-bold">{p.name}</p>
                            <p className="text-[11px] text-slate-400 font-medium">Barcode: {p.barcode || "N/A"}</p>
                          </div>
                          <div className="text-right">
                            <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black ${
                              p.stock_quantity > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                            }`}>
                              Stock: {p.stock_quantity}
                            </span>
                            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                              {formatCurrency((p as any).cost_price || p.selling_price || 0)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Quantity & Reason Notes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                    Quantity (Umubare uravugururwa)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedProduct ? selectedProduct.stock_quantity : 99999}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full rounded-2xl border-slate-200 border bg-slate-50/50 p-3.5 text-sm font-bold text-slate-800 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition"
                  />
                  {selectedProduct && (
                    <p className="text-[11px] font-bold text-slate-400 mt-1">
                      Max available: {selectedProduct.stock_quantity}
                    </p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                    Reason / Description (Impamvu)
                  </label>
                  <input
                    type="text"
                    placeholder="Sobanura impamvu (e.g. Inshingano za sitoke, Yarangije itariki, Yarangiritse kubera kubika nabi...)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-2xl border-slate-200 border bg-slate-50/50 p-3.5 text-sm font-bold text-slate-800 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition"
                  />
                </div>
              </div>

              {/* Submit Footer Button */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedProductId}
                  className="px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-200 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting ? (
                    "Processing..."
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Remove From Stock & Record
                    </>
                  )}
                </button>
              </div>

            </form>
          ) : (
            /* History & Summary Table Tab */
            <div className="space-y-6">
              
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-rose-50 border border-rose-100 flex items-center gap-4">
                  <div className="p-3 bg-rose-500 text-white rounded-xl shadow-sm">
                    <PackageX size={24} />
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-rose-700">Total Wasted Value (Expired + Damaged)</p>
                    <h4 className="text-xl font-black text-rose-900">{formatCurrency(totalWastedValue)}</h4>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-blue-50 border border-blue-100 flex items-center gap-4">
                  <div className="p-3 bg-blue-500 text-white rounded-xl shadow-sm">
                    <DollarSign size={24} />
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-blue-700">Total Expense Product Value</p>
                    <h4 className="text-xl font-black text-blue-900">{formatCurrency(totalExpenseValue)}</h4>
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter records by product, notes, user..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none"
                  />
                </div>

                <select
                  value={historyCategory}
                  onChange={(e) => setHistoryCategory(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 outline-none w-full sm:w-auto"
                >
                  <option value="all">All Categories</option>
                  <option value="expired">Expired</option>
                  <option value="damage">Damaged</option>
                  <option value="expense">Expense</option>
                </select>
              </div>

              {/* Records Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <th className="p-3.5">Date & Time</th>
                      <th className="p-3.5">Who Made It</th>
                      <th className="p-3.5">Location</th>
                      <th className="p-3.5">Product</th>
                      <th className="p-3.5">Category</th>
                      <th className="p-3.5 text-right">Quantity</th>
                      <th className="p-3.5 text-right">Total Value</th>
                      <th className="p-3.5">Reason Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                    {filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400">
                          No records found.
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((rec) => {
                        const badgeStyle = rec.category === "expired"
                          ? "bg-rose-100 text-rose-800"
                          : rec.category === "damage"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-blue-100 text-blue-800";

                        return (
                          <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3.5 text-[11px] text-slate-500 font-medium whitespace-nowrap">
                              <span className="flex items-center gap-1">
                                <Calendar size={12} />
                                {rec.createdAt}
                              </span>
                            </td>
                            <td className="p-3.5">
                              <span className="flex items-center gap-1 font-semibold">
                                <User size={12} className="text-slate-400" />
                                {rec.createdBy}
                              </span>
                            </td>
                            <td className="p-3.5 font-medium text-slate-500">{rec.locationName}</td>
                            <td className="p-3.5 font-black text-slate-900">{rec.productName}</td>
                            <td className="p-3.5">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${badgeStyle}`}>
                                {rec.category}
                              </span>
                            </td>
                            <td className="p-3.5 text-right font-black text-slate-900">{rec.quantity}</td>
                            <td className="p-3.5 text-right font-black text-slate-900 whitespace-nowrap">
                              {formatCurrency(rec.totalLossAmount)}
                            </td>
                            <td className="p-3.5 font-medium text-slate-600 max-w-xs truncate" title={rec.notes}>
                              {rec.notes}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
};
