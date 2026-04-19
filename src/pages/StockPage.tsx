import { useEffect, useMemo, useState } from "react";
import { useNotification } from "../context/NotificationContext";
import { ArrowRightLeft, Pencil, Plus, Search, Trash2, X, Eye, Printer, ChevronRight } from "lucide-react";
import { SectionCard } from "../components/ui/SectionCard";
import { Pagination } from "../components/ui/Pagination";
import { useAuth } from "../context/AuthContext";
import { usePosData } from "../context/PosDataContext";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { listPosProducts, getShopSettings } from "../services/posService";
import { 
  listStockCounts, 
  listStockTransfers, 
  type StockCountSummary, 
  type StockTransferSummary, 
  recordStockCount, 
  recordStockTransfer,
  updateStockTransferStatus 
} from "../services/stockService";
import { listLocations } from "../services/settingsService";
import { QuickAddProductModal } from "../components/ui/QuickAddProductModal";
import type { LocationRecord } from "../types/database";
import { useRealtimeSync } from "../hooks/useRealtimeSync";

type CountMode = "Add" | "Subtract";
type TransferStatus = "Pending" | "In Transit" | "Completed";

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

type TransferLine = {
  id: string;
  productId: string;
  name: string;
  availableQty: number;
  sendQty: number;
};

type TransferRecord = StockTransferSummary;

type CountingForm = {
  id?: string;
  locationId: string;
  notes: string;
  lines: CountingLine[];
};

type TransferForm = {
  id?: string;
  fromLocationId: string;
  toLocationId: string;
  status: TransferStatus;
  lines: TransferLine[];
};

const emptyCountingForm: CountingForm = { locationId: "", notes: "", lines: [] };
const emptyTransferForm: TransferForm = {
  fromLocationId: "",
  toLocationId: "",
  status: "Pending",
  lines: [],
};

export function StockPage() {
  const { profile, can, activeLocationId } = useAuth();
  const { showToast } = useNotification();
  const { refreshData } = usePosData();
  const [products, setProducts] = useState<CountingLine[]>([]);
  const [countings, setCountings] = useState<CountingRecord[]>([]);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [countingSearch, setCountingSearch] = useState("");
  const [transferSearch, setTransferSearch] = useState("");
  const [countingModalOpen, setCountingModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [countingForm, setCountingForm] = useState<CountingForm>(emptyCountingForm);
  const [transferForm, setTransferForm] = useState<TransferForm>(emptyTransferForm);
  const [countingProductSearch, setCountingProductSearch] = useState("");
  const [transferProductSearch, setTransferProductSearch] = useState("");
  const [selectedCount, setSelectedCount] = useState<CountingRecord | null>(null);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferRecord | null>(null);
  const [statusUpdateTransfer, setStatusUpdateTransfer] = useState<TransferRecord | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [quickProductOpen, setQuickProductOpen] = useState(false);
  const [currentCountsPage, setCurrentCountsPage] = useState(1);
  const [currentTransfersPage, setCurrentTransfersPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const { run } = useAsyncAction();

  const loadStockData = async () => {
    // 1. Load critical data (Products and Locations)
    try {
      const [productList, locs] = await Promise.all([
        listPosProducts(activeLocationId, 1000),
        listLocations()
      ]);

      setProducts(
        productList.map((product) => ({
          id: product.id,
          productId: product.id,
          name: product.name,
          stockQty: product.stock_quantity,
          name: product.name,
          stockQty: product.stock_quantity,
          mode: "Add",
          reason: "correction",
          countedQty: 1,
        })),
      );
      setLocations(locs);
      
      if (locs.length === 0) {
        console.warn("StockPage: No locations found. Check RLS policies or database entries.");
      }
    } catch (error) {
      console.error("StockPage: Failed to load primary data (products/locations):", error);
    }

    // 2. Load history data independently (Fail-safe)
    try {
      const stockCounts = await listStockCounts();
      setCountings(stockCounts);
    } catch (error) {
      console.warn("StockPage: Could not load stock counts history.", error);
    }

    try {
      const stockTransfers = await listStockTransfers();
      setTransfers(stockTransfers);
    } catch (error) {
      console.warn("StockPage: Could not load stock transfers history.", error);
    }
  };

  useEffect(() => {
    run(loadStockData);
  }, [run, activeLocationId]);

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
        // Fetch products with specific location stock
        const productList = await listPosProducts(countingForm.locationId, 500);
        if (!active) return;

        const updatedProducts = productList.map((p) => ({
          id: p.id,
          productId: p.id,
          name: p.name,
          stockQty: p.stock_quantity,
          name: p.name,
          stockQty: p.stock_quantity,
          mode: "Add" as const,
          reason: "correction",
          countedQty: 1,
        }));

        setProducts(updatedProducts);

        // Also update items already in the counting form
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

  const createdByName = profile?.full_name || "Active Cashier";

  const countingMatches = useMemo(() => {
    const query = countingProductSearch.trim().toLowerCase();
    if (!query) return [];
    return products.filter((product) => product.name.toLowerCase().includes(query)).slice(0, 6);
  }, [countingProductSearch, products]);

  const transferMatches = useMemo(() => {
    const query = transferProductSearch.trim().toLowerCase();
    if (!query) return [];
    return products.filter((product) => product.name.toLowerCase().includes(query)).slice(0, 6);
  }, [transferProductSearch, products]);

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

  const filteredTransfers = useMemo(() => {
    const query = transferSearch.trim().toLowerCase();
    if (!query) return transfers;
    return transfers.filter((transfer) =>
      transfer.id.toLowerCase().includes(query) ||
      transfer.fromStock.toLowerCase().includes(query) ||
      transfer.toStock.toLowerCase().includes(query) ||
      transfer.status.toLowerCase().includes(query),
    );
  }, [transferSearch, transfers]);

  const totalTransfersPages = Math.ceil(filteredTransfers.length / ITEMS_PER_PAGE);
  const paginatedTransfers = useMemo(() => {
    const start = (currentTransfersPage - 1) * ITEMS_PER_PAGE;
    return filteredTransfers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTransfers, currentTransfersPage]);

  useEffect(() => {
    setCurrentTransfersPage(1);
  }, [transferSearch]);

  function openCountingModal(record?: CountingRecord) {
    if (record) {
      showToast("info", "Viewing previously completed counts is read-only.");
      return;
    }
    const defaultLoc = profile?.location_id || (locations.length > 0 ? locations[0].id : "");
    setCountingForm({ ...emptyCountingForm, locationId: defaultLoc });
    setCountingProductSearch("");
    setCountingModalOpen(true);
  }

  function openTransferModal(record?: TransferRecord) {
    if (record) {
      showToast("info", "Viewing previously completed transfers is read-only.");
      return;
    }
    const defaultFrom = profile?.location_id || (locations.length > 0 ? locations[0].id : "");
    const defaultTo = locations.find(l => l.id !== defaultFrom)?.id || (locations.length > 1 ? locations[1].id : defaultFrom);
    
    setTransferForm({
      ...emptyTransferForm,
      fromLocationId: defaultFrom,
      toLocationId: defaultTo
    });
    setTransferProductSearch("");
    setTransferModalOpen(true);
  }

  function addCountingProduct(productId: string) {
    const product = products.find((item) => item.productId === productId);
    if (!product) return;
    setCountingForm((current) => {
      if (current.lines.some((item) => item.productId === productId)) return current;
      return { ...current, lines: [...current.lines, { ...product, id: `${product.productId}-${Date.now()}`, reason: "correction" }] };
    });
    setCountingProductSearch("");
  }

  function addTransferProduct(productId: string) {
    const product = products.find((item) => item.productId === productId);
    if (!product) return;
    setTransferForm((current) => {
      if (current.lines.some((item) => item.productId === productId)) return current;
      return { ...current, lines: [...current.lines, {
        id: `${product.productId}-${Date.now()}`,
        productId: product.productId,
        name: product.name,
        availableQty: product.stockQty,
        sendQty: 1
      }] };
    });
    setTransferProductSearch("");
  }

  async function saveCounting() {
    if (!countingForm.lines.length || !countingForm.locationId) return;
    
    // Ensure we have a valid database user ID (UUID)
    const userId = profile?.id;
    if (!userId) {
      showToast("error", "Error: Your user profile could not be loaded. Please refresh the page and try again.");
      console.error("Save failed: Profile ID is missing", profile);
      return;
    }

    try {
      await recordStockCount(
        countingForm.locationId,
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
      showToast("success", "Stock count saved successfully!");
    } catch (error: any) {
      console.error("Stock Count Error:", error);
      
      // Extract detailed error information from Supabase error object
      const mainMsg = error?.message || "Failed to submit stock count";
      const details = error?.details ? `\nDetails: ${error.details}` : "";
      const hint = error?.hint ? `\nHint: ${error.hint}` : "";
      
      showToast("error", `${mainMsg}${details}${hint}`);
    }
  }

  async function saveTransfer() {
    if (!transferForm.lines.length || transferForm.fromLocationId === transferForm.toLocationId || !transferForm.fromLocationId || !transferForm.toLocationId) return;
    if (transferForm.lines.some((line) => line.sendQty > line.availableQty)) {
        showToast("warning", "Cannot send more than available quantity.");
        return;
    }

    const userId = profile?.id;
    if (!userId) {
      showToast("error", "Error: Your user profile could not be loaded. Please refresh the page and try again.");
      console.error("Transfer failed: Profile ID is missing", profile);
      return;
    }
    
    try {
      await recordStockTransfer(
        transferForm.fromLocationId,
        transferForm.toLocationId,
        transferForm.status.toLowerCase().replace(" ", "_") as "pending" | "in_transit" | "completed",
        userId,
        transferForm.lines.map(line => ({
          productId: line.productId,
          availableQuantity: line.availableQty,
          transferQuantity: line.sendQty
        }))
      );
      setTransferModalOpen(false);
      setTransferForm(emptyTransferForm);
      await loadStockData();
      await refreshData();
      showToast("success", "Stock transfer recorded successfully!");
    } catch (error: any) {
      console.error("Stock Transfer Error:", error);
      
      const mainMsg = error?.message || "Failed to submit stock transfer";
      const details = error?.details ? `\nDetails: ${error.details}` : "";
      const hint = error?.hint ? `\nHint: ${error.hint}` : "";
      
      showToast("error", `${mainMsg}${details}${hint}`);
    }
  }

  async function updateTransferStatus(newStatus: "in_transit" | "completed") {
    if (!statusUpdateTransfer || !profile?.id) return;

    try {
      await updateStockTransferStatus(statusUpdateTransfer.id, newStatus, profile.id);
      setStatusUpdateTransfer(null);
      await loadStockData();
      await refreshData();
      showToast("success", "Transfer status updated.");
    } catch (error: any) {
      showToast("error", `Failed to update status: ${error.message}`);
    }
  }

  function handlePrint() {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 500);
  }

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">Operations</p>
        <h2 className="mt-1 text-3xl font-bold text-ink">
          Inventory Control {activeLocationId && locations.find(l => l.id === activeLocationId) ? `— ${locations.find(l => l.id === activeLocationId)?.name}` : ""}
        </h2>
      </div>

      <SectionCard title="Stock counts" subtitle="Track physical stock takes and adjustment requests.">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
            <Search size={16} className="text-brand-500" />
            <input
              value={countingSearch}
              onChange={(event) => setCountingSearch(event.target.value)}
              className="w-full border-none bg-transparent text-sm outline-none"
              placeholder="Search stock count, location or recorder"
            />
          </label>
          {can("Stock", "add") && (
            <button
              onClick={() => openCountingModal()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              <Plus size={16} />
              New Count
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-[0_20px_50px_rgba(37,99,235,0.08)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                <tr>
                  {[
                    "Count",
                    "Stock Location",
                    "Recorder",
                    "Date",
                    "Actions",
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
                      <td className="border-b border-slate-100 px-5 py-4 font-medium text-slate-700">{count.stockName}</td>
                      <td className="border-b border-slate-100 px-5 py-4 text-slate-500">{count.createdBy}</td>
                      <td className="border-b border-slate-100 px-5 py-4 text-slate-500">{count.createdAt}</td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {can("Stock", "edit") && (
                            <button
                              onClick={() => openCountingModal(count)}
                              className="rounded-xl bg-sky-50 p-2 text-sky-600 transition hover:bg-sky-100"
                              title="Edit"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedCount(count)}
                            className="rounded-xl bg-slate-50 p-2 text-slate-400 transition hover:bg-slate-100"
                            title="View Info"
                          >
                            <Eye size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                      No stock count records available.
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

      <SectionCard title="Stock transfers" subtitle="Monitor stock movement between locations.">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
            <Search size={16} className="text-brand-500" />
            <input
              value={transferSearch}
              onChange={(event) => setTransferSearch(event.target.value)}
              className="w-full border-none bg-transparent text-sm outline-none"
              placeholder="Search transfer ID, origin or destination"
            />
          </label>
          {can("Stock", "add") && (
            <button
              onClick={() => openTransferModal()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              <Plus size={16} />
              New Transfer
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-[0_20px_50px_rgba(37,99,235,0.08)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                <tr>
                  {[
                    "Transfer",
                    "From",
                    "To",
                    "Status",
                    "Created",
                    "Actions",
                  ].map((column) => (
                    <th key={column} className="border-b border-white/10 px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-100">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                {paginatedTransfers.length > 0 ? (
                  paginatedTransfers.map((transfer) => {
                    const statusColors = {
                      "Pending": "bg-amber-50 text-amber-600 border-amber-100",
                      "In Transit": "bg-blue-50 text-blue-600 border-blue-100",
                      "Completed": "bg-emerald-50 text-emerald-600 border-emerald-100"
                    };
                    
                    return (
                      <tr 
                        key={transfer.id} 
                        className="group transition hover:bg-brand-50/40 cursor-pointer"
                        onClick={() => setSelectedTransfer(transfer)}
                      >
                        <td className="border-b border-slate-100 px-5 py-4">
                          <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                            #{transfer.transferNumber || transfer.id.slice(0, 5)}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-5 py-4 text-slate-700 font-medium">
                          <div className="flex items-center gap-2">
                             {transfer.fromStock}
                             <ChevronRight size={12} className="text-slate-300" />
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-5 py-4 text-slate-700 font-medium">{transfer.toStock}</td>
                        <td className="border-b border-slate-100 px-5 py-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (transfer.status !== 'Completed' && can("Stock", "edit")) {
                                setStatusUpdateTransfer(transfer);
                              }
                            }}
                            disabled={transfer.status === "Completed"}
                            className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition hover:brightness-95 disabled:hover:brightness-100 ${statusColors[transfer.status]}`}
                          >
                            <div className="flex items-center gap-1.5">
                              {transfer.status}
                              {transfer.status !== 'Completed' && <ArrowRightLeft size={10} />}
                            </div>
                          </button>
                        </td>
                        <td className="border-b border-slate-100 px-5 py-4 text-slate-500">{transfer.createdAt}</td>
                        <td className="border-b border-slate-100 px-5 py-4">
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {transfer.status === "Pending" && can("Stock", "edit") ? (
                              <button
                                onClick={() => openTransferModal(transfer)}
                                className="rounded-xl bg-sky-50 p-2 text-sky-600 transition hover:bg-sky-100"
                              >
                                <Pencil size={16} />
                              </button>
                            ) : (
                              <div className="p-2 text-slate-300 cursor-not-allowed" title="Completed transfers cannot be edited">
                                <Pencil size={16} />
                              </div>
                            )}
                            <button
                              onClick={() => setSelectedTransfer(transfer)}
                              className="rounded-xl bg-slate-50 p-2 text-slate-400 transition hover:bg-slate-100"
                            >
                              <Eye size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                      No stock transfer records available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentTransfersPage}
            totalPages={totalTransfersPages}
            totalItems={filteredTransfers.length}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setCurrentTransfersPage}
          />
        </div>
      </SectionCard>

      {countingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setCountingModalOpen(false)}>
          <div className="w-full max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-600">Inventory Control</p>
                <h2 className="mt-2 text-2xl font-bold text-ink">{countingForm.id ? "Edit Stock Count" : "New Stock Count"}</h2>
              </div>
              <button type="button" onClick={() => setCountingModalOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>
            
            <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto]">
              <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Stock Location</p>
                <select
                  value={countingForm.locationId}
                  onChange={(e) => setCountingForm((prev) => ({ ...prev, locationId: e.target.value }))}
                  className="w-full rounded-xl border border-sky-100 bg-white px-4 py-2 text-sm outline-none mb-4"
                >
                  <option value="" disabled>Select Location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>

                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Notes (Optional)</p>
                <input
                  value={countingForm.notes}
                  onChange={(e) => setCountingForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. End of month review"
                  className="w-full rounded-xl border border-sky-100 bg-white px-4 py-2 text-sm outline-none"
                />
              </div>
              <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Add Products</p>
                <div className="relative">
                  <div className="flex gap-2 text-ink">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        value={countingProductSearch}
                        onChange={(e) => setCountingProductSearch(e.target.value)}
                        className="w-full rounded-xl border border-sky-100 bg-white pl-9 pr-4 py-2 text-sm outline-none shadow-sm"
                        placeholder="Search products..."
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
                    <th className="px-4 py-3">Item Name</th>
                    <th className="px-4 py-3">Sys Qty</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3 text-right">Remove</th>
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
                            className="rounded-lg border border-slate-200 px-2 py-1 outline-none text-xs font-semibold uppercase text-slate-600 bg-white"
                          >
                            <option value="correction">Correction</option>
                            <option value="expired">Expired</option>
                            <option value="damaged">Damaged</option>
                            <option value="stolen">Stolen</option>
                            <option value="other">Other</option>
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
                            className="text-rose-500 transition hover:text-rose-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">No items added. Search above.</td>
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

      {transferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setTransferModalOpen(false)}>
          <div className="w-full max-w-4xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-600">Stock Exchange</p>
                <h2 className="mt-2 text-2xl font-bold text-ink">{transferForm.id ? "Edit Stock Transfer" : "New Stock Transfer"}</h2>
              </div>
              <button type="button" onClick={() => setTransferModalOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>
            
            <div className="mb-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Origin Site</p>
                <select
                  value={transferForm.fromLocationId}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, fromLocationId: e.target.value }))}
                  className="w-full rounded-xl border border-sky-100 bg-white px-4 py-2 text-sm outline-none"
                >
                  <option value="" disabled>Select Origin</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center justify-center pt-6 text-brand-400">
                <ArrowRightLeft size={24} />
              </div>

              <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Destination Site</p>
                <select
                  value={transferForm.toLocationId}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, toLocationId: e.target.value }))}
                  className="w-full rounded-xl border border-sky-100 bg-white px-4 py-2 text-sm outline-none"
                >
                  <option value="" disabled>Select Destination</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_auto]">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">Transfer Status</p>
                <select
                  value={transferForm.status}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, status: e.target.value as TransferStatus }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none"
                >
                  <option value="Pending">Pending</option>
                  <option value="In Transit">In Transit</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
              
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">Add Products</p>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    value={transferProductSearch}
                    onChange={(e) => setTransferProductSearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm outline-none"
                    placeholder="Search products..."
                  />
                  {transferMatches.length > 0 && (
                    <div className="absolute top-11 z-10 w-full rounded-xl border border-slate-100 bg-white py-2 shadow-lg">
                      {transferMatches.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addTransferProduct(product.productId)}
                          className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          {product.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-6 max-h-[25vh] overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100">
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    <th className="px-4 py-3">Item Name</th>
                    <th className="px-4 py-3">Avail in Origin</th>
                    <th className="px-4 py-3">Send Qty</th>
                    <th className="px-4 py-3 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {transferForm.lines.length > 0 ? (
                    transferForm.lines.map((line, idx) => (
                      <tr key={line.id}>
                        <td className="px-4 py-3 font-medium text-slate-700">{line.name}</td>
                        <td className="px-4 py-3 text-slate-500">{line.availableQty}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="1"
                            max={line.availableQty}
                            value={line.sendQty}
                            onChange={(e) => {
                              const val = Math.max(1, Math.min(line.availableQty, Number(e.target.value)));
                              setTransferForm((prev) => {
                                const newLines = [...prev.lines];
                                newLines[idx].sendQty = val;
                                return { ...prev, lines: newLines };
                              });
                            }}
                            className="w-24 rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-brand-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setTransferForm((prev) => ({
                                ...prev,
                                lines: prev.lines.filter((_, i) => i !== idx),
                              }));
                            }}
                            className="text-rose-500 transition hover:text-rose-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-500">No items added to transfer.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setTransferModalOpen(false)} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={saveTransfer} disabled={!transferForm.lines.length || !transferForm.fromLocationId || !transferForm.toLocationId || transferForm.fromLocationId === transferForm.toLocationId} className="flex-1 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">Save Transfer</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail View & Printing Modal for Stock Counts */}
      {selectedCount && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm print:contents" onClick={() => setSelectedCount(null)}>
          <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-soft print:shadow-none print:border-none print:p-0" onClick={(e) => e.stopPropagation()}>
            <div className="mb-8 flex items-center justify-between print:hidden">
              <h3 className="text-xl font-bold text-ink">Count Details</h3>
              <button 
                onClick={() => setSelectedCount(null)} 
                className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div id="printable-count" className="print:block">
              <div className="mb-6 flex items-center justify-between border-b pb-6">
                <div>
                  <h2 className="text-3xl font-black tracking-tight text-brand-600 uppercase">Stock Report</h2>
                  <p className="text-sm font-semibold text-slate-500 mt-1">Ref: #{selectedCount.countNumber || selectedCount.id.slice(0, 5)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-ink">Inventory POS</p>
                  <p className="text-sm text-slate-500">Official Stock Document</p>
                </div>
              </div>

              <div className="mb-8 grid grid-cols-2 gap-8 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Inventory Logic</p>
                  <p className="font-semibold text-slate-700">Location: {selectedCount.stockName}</p>
                  <p className="text-slate-500">Recorded by: {selectedCount.createdBy}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Timing</p>
                  <p className="font-semibold text-slate-700">{selectedCount.createdAt}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs font-bold uppercase tracking-widest text-slate-500">
                      <th className="px-4 py-3">Product Name</th>
                      <th className="px-4 py-3">System Qty</th>
                      <th className="px-4 py-3">Counted</th>
                      <th className="px-4 py-3">Mode</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3 text-right">Final Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {selectedCount.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-3 font-semibold text-slate-700">{line.name}</td>
                        <td className="px-4 py-3 text-slate-500">{line.stockQty}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${line.mode === 'Add' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {line.mode === 'Add' ? `+ ${line.countedQty}` : `- ${line.countedQty}`}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                            {line.reason}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-ink">{line.stockQty + (line.mode === 'Add' ? line.countedQty : -line.countedQty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-8 flex gap-3 print:hidden">
              <button 
                onClick={() => setSelectedCount(null)} 
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button 
                onClick={handlePrint}
                className="flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-8 py-3 text-sm font-semibold text-white hover:bg-brand-600"
              >
                <Printer size={18} />
                Print Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail View & Printing Modal for Transfers */}
      {selectedTransfer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm print:contents" onClick={() => setSelectedTransfer(null)}>
          <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-soft print:shadow-none print:border-none print:p-0" onClick={(e) => e.stopPropagation()}>
            <div className="mb-8 flex items-center justify-between print:hidden">
              <h3 className="text-xl font-bold text-ink">Transfer Receipt</h3>
              <button 
                onClick={() => setSelectedTransfer(null)} 
                className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div id="printable-transfer" className="print:block">
              <div className="mb-6 flex items-center justify-between border-b pb-6">
                <div>
                  <h2 className="text-3xl font-black tracking-tight text-blue-600 uppercase">Transfer Slip</h2>
                  <p className="text-sm font-semibold text-slate-500 mt-1">Voucher: #{selectedTransfer.transferNumber || selectedTransfer.id.slice(0, 5)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-ink">Inventory POS</p>
                  <p className={`text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-md inline-block mt-1 ${selectedTransfer.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                    {selectedTransfer.status}
                  </p>
                </div>
              </div>

              <div className="mb-8 flex items-center justify-between rounded-3xl bg-slate-50 p-6 text-sm">
                <div className="text-center flex-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Source Location</p>
                  <p className="text-lg font-bold text-slate-800">{selectedTransfer.fromStock}</p>
                </div>
                <div className="px-4 text-slate-300">
                   <ArrowRightLeft size={24} />
                </div>
                <div className="text-center flex-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Destination</p>
                  <p className="text-lg font-bold text-slate-800">{selectedTransfer.toStock}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs font-bold uppercase tracking-widest text-slate-500">
                      <th className="px-4 py-3">Item Description</th>
                      <th className="px-4 py-3 text-right">Qty Sent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedTransfer.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-3 font-medium text-slate-800">{line.name}</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-600">{line.sendQty} units</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-right text-sm text-slate-400 italic">
                Issued on: {selectedTransfer.createdAt}
              </div>
            </div>

            <div className="mt-8 flex gap-3 print:hidden">
              <button 
                onClick={() => setSelectedTransfer(null)} 
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button 
                onClick={handlePrint}
                className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Printer size={18} />
                Print Voucher
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Selection Modal */}
      {statusUpdateTransfer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setStatusUpdateTransfer(null)}>
          <div className="w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white p-8 shadow-soft" onClick={(e) => e.stopPropagation()}>
             <div className="mb-6 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <ArrowRightLeft size={32} />
                </div>
                <h3 className="text-xl font-bold text-ink">Update Status</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Change the status for Transfer <strong>#{statusUpdateTransfer.transferNumber || statusUpdateTransfer.id.slice(0, 5)}</strong>
                </p>
             </div>

             <div className="grid gap-3">
                <button
                  onClick={() => updateTransferStatus("in_transit")}
                  className={`flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-bold text-blue-700 transition hover:bg-blue-100 ${statusUpdateTransfer.status === 'In Transit' ? 'ring-2 ring-blue-500' : ''}`}
                >
                  Mark as IN TRANSIT
                  <div className="rounded-full bg-white p-1 shadow-sm"><ChevronRight size={16} /></div>
                </button>

                <button
                  onClick={() => updateTransferStatus("completed")}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-4 text-sm font-bold text-white transition hover:bg-emerald-600"
                >
                  Mark as COMPLETED
                </button>

                <button
                  onClick={() => setStatusUpdateTransfer(null)}
                  className="mt-2 rounded-xl py-2 text-xs font-semibold text-slate-400 hover:text-slate-600"
                >
                  Cancel
                </button>
             </div>

             <p className="mt-6 border-t pt-4 text-[10px] text-center uppercase tracking-widest text-slate-400 font-bold">
                * Completed transfers move stock and cannot be changed
             </p>
          </div>
        </div>
      )}

      {/* Global Print Overlay for professional reports */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:contents, .print\\:contents * { visibility: visible; }
          .print\\:contents { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
      {/* QUICK ADD PRODUCT MODAL */}
      <QuickAddProductModal 
        isOpen={quickProductOpen}
        onClose={() => setQuickProductOpen(false)}
        onSuccess={() => {
          // Re-load stock data to include the new product
          run(loadStockData);
        }}
      />
    </div>
  );
}
