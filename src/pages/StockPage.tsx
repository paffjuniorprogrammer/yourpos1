import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNotification } from "../context/NotificationContext";

import { Plus, Search, X, Eye, Printer } from "lucide-react";
import { SectionCard } from "../components/ui/SectionCard";
import { Pagination } from "../components/ui/Pagination";
import { useAuth } from "../context/AuthContext";
import { usePosData } from "../context/PosDataContext";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { listPosProducts } from "../services/posService";
import { 
  listStockCounts, 
  type StockCountSummary, 
  recordStockCount, 
} from "../services/stockService";
import { listLocations } from "../services/settingsService";
import { QuickAddProductModal } from "../components/ui/QuickAddProductModal";
import type { LocationRecord } from "../types/database";
import { useRealtimeSync } from "../hooks/useRealtimeSync";

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

type CountingRecord = StockCountSummary;

type CountingForm = {
  id?: string;
  locationId: string;
  notes: string;
  lines: CountingLine[];
};

const emptyCountingForm: CountingForm = { locationId: "", notes: "", lines: [] };

const ITEMS_PER_PAGE = 10;

export function StockPage() {
  const { t } = useTranslation();
  const { profile, can, activeLocationId, business, assignedLocations } = useAuth();
  const navigate = useNavigate();

  const { showToast } = useNotification();
  const { refreshData } = usePosData();
  const [products, setProducts] = useState<CountingLine[]>([]);
  const [countings, setCountings] = useState<CountingRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [countingSearch, setCountingSearch] = useState("");
  const [countingModalOpen, setCountingModalOpen] = useState(false);
  const [countingForm, setCountingForm] = useState<CountingForm>(emptyCountingForm);
  const [countingProductSearch, setCountingProductSearch] = useState("");
  const [selectedCount, setSelectedCount] = useState<CountingRecord | null>(null);
  const [quickProductOpen, setQuickProductOpen] = useState(false);
  const [currentCountsPage, setCurrentCountsPage] = useState(1);

  const { run } = useAsyncAction();

  const loadStockData = async () => {
    try {
      const [productList, locs] = await Promise.all([
        listPosProducts(activeLocationId, 1000),
        listLocations(business?.id)
      ]);
      const locationList = (locs.length ? locs : assignedLocations) as LocationRecord[];

      setProducts(
        productList.map((product) => ({
          id: product.id,
          productId: product.id,
          name: product.name,
          stockQty: product.stock_quantity,
          mode: "Add",
          reason: "correction",
          countedQty: 1,
        })),
      );
      setLocations(locationList);
    } catch (error) {
      console.error("StockPage: Failed to load primary data (products/locations):", error);
    }

    try {
      const stockCounts = await listStockCounts();
      setCountings(stockCounts);
    } catch (error) {
      console.warn("StockPage: Could not load stock counts history.", error);
    }
  };

  useEffect(() => {
    run(loadStockData);
  }, [run, activeLocationId, assignedLocations]);

  // Real-time synchronization for Stock Page
  useRealtimeSync({
    onStockChanged: () => {
      void loadStockData();
    },
    onProductChanged: () => {
      void loadStockData();
    }
  });

  // Effect to re-fetch stock quantities when locationId changes in the counting modal
  useEffect(() => {
    if (!countingModalOpen || !countingForm.locationId) return;

    let active = true;
    async function updateLocationStock() {
      try {
        const productList = await listPosProducts(countingForm.locationId, 500);
        if (!active) return;

        const updatedProducts = productList.map((p) => ({
          id: p.id,
          productId: p.id,
          name: p.name,
          stockQty: p.stock_quantity,
          mode: "Add" as const,
          reason: "correction",
          countedQty: 1,
        }));

        setProducts(updatedProducts);

        setCountingForm(prev => {
          const newLines = prev.lines.map(line => {
            const match = productList.find(p => p.id === line.productId);
            if (match) {
              return { ...line, stockQty: match.stock_quantity };
            }
            return line;
          });
          return { ...prev, lines: newLines };
        });

      } catch (err) {
        console.error("Failed to update location-specific stock:", err);
      }
    }

    void updateLocationStock();
    return () => { active = false; };
  }, [countingModalOpen, countingForm.locationId]);

  const countingMatches = useMemo(() => {
    const query = countingProductSearch.trim().toLowerCase();
    if (!query) return [];
    return products.filter((product) => product.name.toLowerCase().includes(query)).slice(0, 6);
  }, [countingProductSearch, products]);

  const filteredCountings = useMemo(() => {
    const query = countingSearch.trim().toLowerCase();
    if (!query) return countings;
    return countings.filter((count) =>
      count.id.toLowerCase().includes(query) ||
      count.stockName.toLowerCase().includes(query) ||
      count.createdBy.toLowerCase().includes(query),
    );
  }, [countingSearch, countings]);

  const totalCountsPages = Math.ceil(filteredCountings.length / ITEMS_PER_PAGE);
  const paginatedCountings = useMemo(() => {
    const start = (currentCountsPage - 1) * ITEMS_PER_PAGE;
    return filteredCountings.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredCountings, currentCountsPage]);

  useEffect(() => {
    setCurrentCountsPage(1);
  }, [countingSearch]);

  function addCountingProduct(productId: string) {
    const product = products.find((item) => item.productId === productId);
    if (!product) return;
    setCountingForm((current) => {
      if (current.lines.some((item) => item.productId === productId)) return current;
      return { ...current, lines: [...current.lines, { ...product, id: `${product.productId}-${Date.now()}`, reason: "correction" }] };
    });
    setCountingProductSearch("");
  }

  async function saveCounting() {
    if (!countingForm.lines.length || !countingForm.locationId) return;
    
    const userId = profile?.id;
    if (!userId) {
      showToast("error", t('stock.errors.profile_load'));
      return;
    }

    try {
      await recordStockCount(
        countingForm.locationId,
        business?.id || "",
        userId,
        countingForm.notes,
        countingForm.lines.map(line => ({
          productId: line.productId,
          systemQuantity: line.stockQty,
          countedQuantity: line.countedQty,
          mode: line.mode,
          reason: line.reason
        }))
      );
      setCountingModalOpen(false);
      setCountingForm(emptyCountingForm);
      await loadStockData();
      await refreshData();
      showToast("success", t('stock.success.count_saved'));
    } catch (error: any) {
      console.error("Stock Count Error:", error);
      showToast("error", error?.message || "Failed to submit stock count");
    }
  }

  function handlePrint() {
    setTimeout(() => window.print(), 300);
  }

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">{t('stock.title')}</p>
        <h2 className="mt-1 text-3xl font-bold text-ink">
          {t('stock.title')} {activeLocationId && locations.find(l => l.id === activeLocationId) ? `— ${locations.find(l => l.id === activeLocationId)?.name}` : ""}
        </h2>
      </div>

      <SectionCard title={t('stock.counts.title')} subtitle={t('stock.counts.subtitle')}>
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
            <Search size={16} className="text-brand-500" />
            <input
              value={countingSearch}
              onChange={(event) => setCountingSearch(event.target.value)}
              className="w-full border-none bg-transparent text-sm outline-none"
              placeholder={t('stock.counts.search_placeholder')}
            />
          </label>
          {can("Stock", "add") && (
            <button
              onClick={() => navigate('/stock/new-count')}
              className="flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              <Plus size={16} />
              {t('stock.counts.new_count')}
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-[0_20px_50px_rgba(37,99,235,0.08)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                <tr>
                  {[
                    t('stock.counts.table.count'),
                    t('stock.counts.table.location'),
                    t('stock.counts.table.recorder'),
                    t('stock.counts.table.date'),
                    t('common.actions'),
                  ].map((column) => (
                    <th key={column} className="border-b border-white/10 px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-100">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="bg-white">
                {paginatedCountings.length > 0 ? (
                  paginatedCountings.map((count) => (
                    <tr 
                      key={count.id} 
                      className="group transition hover:bg-brand-50/40 cursor-pointer"
                      onClick={() => setSelectedCount(count)}
                    >
                      <td className="border-b border-slate-100 px-5 py-4">
                        <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                          #{count.countNumber || count.id.slice(0, 5)}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4 text-slate-700 font-medium">{count.stockName}</td>
                      <td className="border-b border-slate-100 px-5 py-4 text-slate-500 font-medium">
                        {count.createdBy}
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4 text-slate-500">
                        {count.createdAt}
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCount(count);
                          }}
                          className="rounded-xl bg-slate-50 p-2 text-slate-400 transition hover:bg-slate-100"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                      {t('stock.counts.no_records')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentCountsPage}
            totalPages={totalCountsPages}
            totalItems={filteredCountings.length}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setCurrentCountsPage}
          />
        </div>
      </SectionCard>

      {countingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setCountingModalOpen(false)}>
          <div className="w-full max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-600">{t('stock.title')}</p>
                <h2 className="mt-2 text-2xl font-bold text-ink">{countingForm.id ? t('stock.counts.edit_title') : t('stock.counts.create_title')}</h2>
              </div>
              <button type="button" onClick={() => setCountingModalOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto]">
              <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">{t('stock.counts.modal.location')}</p>
                <select
                  value={countingForm.locationId}
                  onChange={(e) => setCountingForm((prev) => ({ ...prev, locationId: e.target.value }))}
                  className="w-full rounded-xl border border-sky-100 bg-white px-4 py-2 text-sm outline-none mb-4"
                >
                  <option value="" disabled>{t('stock.counts.modal.select_location')}</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>

                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">{t('stock.counts.modal.notes')}</p>
                <input
                  value={countingForm.notes}
                  onChange={(e) => setCountingForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder={t('stock.counts.modal.notes_placeholder')}
                  className="w-full rounded-xl border border-sky-100 bg-white px-4 py-2 text-sm outline-none"
                />
              </div>
              <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">{t('stock.counts.modal.add_products')}</p>
                <div className="relative">
                  <div className="flex gap-2 text-ink">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        value={countingProductSearch}
                        onChange={(e) => setCountingProductSearch(e.target.value)}
                        className="w-full rounded-xl border border-sky-100 bg-white pl-9 pr-4 py-2 text-sm outline-none shadow-sm"
                        placeholder={t('stock.counts.modal.search_products')}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuickProductOpen(true)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-soft transition hover:scale-105"
                      title="Add New Product"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                  {countingMatches.length > 0 && (
                    <div className="absolute top-12 z-10 w-full rounded-xl border border-slate-100 bg-white py-2 shadow-lg">
                      {countingMatches.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addCountingProduct(product.productId)}
                          className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 text-ink font-semibold"
                        >
                          {product.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-6 max-h-[30vh] overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100">
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    <th className="px-4 py-3">{t('stock.counts.modal.table.name')}</th>
                    <th className="px-4 py-3">{t('stock.counts.modal.table.system_qty')}</th>
                    <th className="px-4 py-3">{t('stock.counts.modal.table.counted_qty')}</th>
                    <th className="px-4 py-3">{t('stock.counts.modal.table.mode')}</th>
                    <th className="px-4 py-3">{t('stock.counts.modal.table.reason')}</th>
                    <th className="px-4 py-3 text-right">{t('common.remove')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {countingForm.lines.length > 0 ? (
                    countingForm.lines.map((line, idx) => (
                      <tr key={line.id}>
                        <td className="px-4 py-3 font-medium text-slate-700">{line.name}</td>
                        <td className="px-4 py-3 text-slate-500">{line.stockQty}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            value={line.countedQty}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setCountingForm((prev) => {
                                const newLines = [...prev.lines];
                                newLines[idx].countedQty = val;
                                return { ...prev, lines: newLines };
                              });
                            }}
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1 outline-none font-bold"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={line.mode}
                            onChange={(e) => {
                              const val = e.target.value as CountMode;
                              setCountingForm((prev) => {
                                const newLines = [...prev.lines];
                                newLines[idx].mode = val;
                                return { ...prev, lines: newLines };
                              });
                            }}
                            className="rounded-lg border border-slate-200 px-2 py-1 outline-none font-semibold text-brand-700 bg-brand-50"
                          >
                            <option value="Add">Add (+)</option>
                            <option value="Subtract">Subtract (-)</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={line.reason}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCountingForm((prev) => {
                                const newLines = [...prev.lines];
                                newLines[idx].reason = val;
                                return { ...prev, lines: newLines };
                              });
                            }}
                            className="rounded-lg border border-slate-200 px-2 py-1 outline-none text-xs"
                          >
                            <option value="correction">Correction</option>
                            <option value="damaged">Damaged / Broken</option>
                            <option value="expired">Expired</option>
                            <option value="missing">Lost / Missing</option>
                            <option value="audit">Periodic Audit</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setCountingForm((prev) => ({
                                ...prev,
                                lines: prev.lines.filter((_, i) => i !== idx),
                              }));
                            }}
                            className="text-xs font-bold text-rose-500 hover:underline"
                          >
                            {t('common.remove')}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                        No products added to count yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setCountingModalOpen(false)} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={saveCounting} disabled={!countingForm.lines.length} className="flex-1 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">Save Stock Count</button>
            </div>
          </div>
        </div>
      )}

      {/* ── STOCK COUNT PRINT PORTAL ── */}
      {selectedCount && createPortal(
        <div className="print-doc" style={{ padding: '18mm', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: '12px', marginBottom: '20px' }}>
            <div>
              <p style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#94a3b8' }}>STOCK REPORT</p>
              <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#1d4ed8', margin: '4px 0' }}>Stock Count</h1>
              <p style={{ fontSize: '12px', color: '#64748b' }}>Ref: #{selectedCount.countNumber || selectedCount.id.slice(0,5)}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '14px', fontWeight: 700 }}>Inventory POS</p>
              <p style={{ fontSize: '11px', color: '#64748b' }}>Official Stock Document</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px', fontSize: '12px' }}>
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px' }}>
              <p style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#94a3b8', marginBottom: '6px' }}>INVENTORY LOGIC</p>
              <p style={{ fontWeight: 600 }}>Location: {selectedCount.stockName}</p>
              <p style={{ color: '#64748b' }}>Recorded by: {selectedCount.createdBy}</p>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', textAlign: 'right' }}>
              <p style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#94a3b8', marginBottom: '6px' }}>TIMING</p>
              <p style={{ fontWeight: 600 }}>{selectedCount.createdAt}</p>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '20px' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Item</th>
                <th style={{ padding: '8px', textAlign: 'center' }}>System Qty</th>
                <th style={{ padding: '8px', textAlign: 'center' }}>Adjustment</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Reason</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Final Qty</th>
              </tr>
            </thead>
            <tbody>
              {selectedCount.lines.map((line) => (
                <tr key={line.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 600 }}>{line.name}</td>
                  <td style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>{line.stockQty}</td>
                  <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: line.mode === 'Add' ? '#059669' : '#dc2626' }}>
                    {line.mode === 'Add' ? `+${line.countedQty}` : `-${line.countedQty}`}
                  </td>
                  <td style={{ padding: '8px', textTransform: 'capitalize', color: '#64748b' }}>{line.reason}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800 }}>
                    {line.stockQty + (line.mode === 'Add' ? line.countedQty : -line.countedQty)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
        document.body
      )}

      <QuickAddProductModal
        isOpen={quickProductOpen}
        onClose={() => setQuickProductOpen(false)}
        onSuccess={() => void loadStockData()}
      />
    </div>
  );
}
