import { useEffect, useMemo, useState } from "react";
import { 
  ArrowRightLeft, 
  ChevronRight, 
  Eye, 
  Pencil, 
  Plus, 
  Search, 
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { SectionCard } from "../components/ui/SectionCard";
import { Pagination } from "../components/ui/Pagination";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { usePosData } from "../context/PosDataContext";
import { listLocations } from "../services/settingsService";
import { listPosProducts } from "../services/posService";
import { 
  listStockTransfers, 
  recordStockTransfer, 
  updateStockTransfer, 
  updateStockTransferStatus,
  type StockTransferSummary 
} from "../services/stockService";

type TransferStatus = "Pending" | "In Transit" | "Completed";

type TransferLine = {
  id: string;
  productId: string;
  name: string;
  availableQty: number;
  sendQty: number;
};

type TransferRecord = StockTransferSummary;

type TransferForm = {
  id?: string;
  fromLocationId: string;
  toLocationId: string;
  status: TransferStatus;
  lines: TransferLine[];
};

const emptyTransferForm: TransferForm = {
  fromLocationId: "",
  toLocationId: "",
  status: "Pending",
  lines: [],
};

const ITEMS_PER_PAGE = 8;

export function TransfersPage() {
  const { t } = useTranslation();
  const { profile, can, activeLocationId, assignedLocations, business } = useAuth();
  const { showToast } = useNotification();
  const { refreshData } = usePosData();

  const [locations, setLocations] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState<TransferForm>(emptyTransferForm);
  const [transferProductSearch, setTransferProductSearch] = useState("");
  const [selectedTransfer, setSelectedTransfer] = useState<TransferRecord | null>(null);
  const [statusUpdateTransfer, setStatusUpdateTransfer] = useState<TransferRecord | null>(null);
  const [currentTransfersPage, setCurrentTransfersPage] = useState(1);

  const visibleLocationIds = useMemo(() => {
    if (profile?.role === "admin") {
      return locations.map((loc) => loc.id);
    }
    return assignedLocations.map((loc) => loc.id);
  }, [profile?.role, locations, assignedLocations]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [locs, prods] = await Promise.all([
        listLocations(business?.id),
        listPosProducts(activeLocationId || null, 1000)
      ]);
      setLocations(locs);
      setAvailableProducts(prods);

      const visIds = profile?.role === "admin" ? locs.map((l: any) => l.id) : assignedLocations.map((l: any) => l.id);
      const stockTransfers = await listStockTransfers(visIds);
      setTransfers(stockTransfers);
    } catch (err: any) {
      console.error("Failed to load transfers data:", err);
      showToast("error", "Failed to load stock transfers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [business?.id, activeLocationId]);

  function canEditTransfer(transfer: TransferRecord) {
    if (transfer.status === "Completed") return false;
    if (profile?.role === "admin") return true;
    return transfer.createdById === profile?.id;
  }

  function canCompleteTransfer(transfer: TransferRecord) {
    if (transfer.status === "Completed") return false;
    if (profile?.role === "admin") return true;
    return visibleLocationIds.includes(transfer.toLocationId);
  }

  const filteredTransfers = useMemo(() => {
    const q = transferSearch.trim().toLowerCase();
    if (!q) return transfers;
    return transfers.filter(
      (tr) =>
        tr.fromStock.toLowerCase().includes(q) ||
        tr.toStock.toLowerCase().includes(q) ||
        tr.createdBy.toLowerCase().includes(q) ||
        (tr.transferNumber && String(tr.transferNumber).includes(q))
    );
  }, [transfers, transferSearch]);

  const totalTransfersPages = Math.ceil(filteredTransfers.length / ITEMS_PER_PAGE);
  const paginatedTransfers = useMemo(() => {
    const start = (currentTransfersPage - 1) * ITEMS_PER_PAGE;
    return filteredTransfers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTransfers, currentTransfersPage]);

  const transferMatches = useMemo(() => {
    const query = transferProductSearch.trim().toLowerCase();
    if (!query) return [];
    return availableProducts
      .filter((item: any) => item.name?.toLowerCase().includes(query))
      .slice(0, 5);
  }, [availableProducts, transferProductSearch]);

  function addTransferProduct(productId: string) {
    const product = availableProducts.find((item: any) => item.id === productId);
    if (!product) return;

    setTransferForm((prev) => {
      if (prev.lines.some((line) => line.productId === productId)) return prev;
      return {
        ...prev,
        lines: [
          ...prev.lines,
          {
            id: `line-${Date.now()}-${Math.random()}`,
            productId: product.id,
            name: product.name,
            availableQty: Number(product.stock_quantity || 0),
            sendQty: 1,
          },
        ],
      };
    });
    setTransferProductSearch("");
  }

  async function saveTransfer() {
    if (!transferForm.lines.length || transferForm.fromLocationId === transferForm.toLocationId || !transferForm.fromLocationId || !transferForm.toLocationId) return;
    if (transferForm.lines.some((line) => line.sendQty > line.availableQty)) {
        showToast("warning", "Transfer quantity exceeds available stock");
        return;
    }

    const userId = profile?.id;
    if (!userId) {
      showToast("error", "Profile ID is missing");
      return;
    }
    
    try {
      const normalizedStatus = transferForm.status.toLowerCase().replace(" ", "_") as "pending" | "in_transit" | "completed";
      const payloadLines = transferForm.lines.map(line => ({
        productId: line.productId,
        availableQuantity: line.availableQty,
        transferQuantity: line.sendQty
      }));

      if (transferForm.id) {
        if (normalizedStatus === "completed") {
          showToast("warning", "The receiving branch must confirm completion.");
        }
        await updateStockTransfer(
          transferForm.id,
          transferForm.fromLocationId,
          transferForm.toLocationId,
          normalizedStatus === "completed" ? "in_transit" : normalizedStatus,
          userId,
          payloadLines
        );
        showToast("success", "Transfer updated successfully");
      } else {
        await recordStockTransfer(
          transferForm.fromLocationId,
          transferForm.toLocationId,
          business?.id || "",
          normalizedStatus,
          userId,
          payloadLines
        );
        showToast("success", "Transfer created successfully");
      }

      setTransferModalOpen(false);
      setTransferForm(emptyTransferForm);
      await loadData();
      await refreshData();
    } catch (error: any) {
      console.error("Transfer Error:", error);
      showToast("error", `Failed to save transfer: ${error.message}`);
    }
  }

  function openTransferModal(record?: TransferRecord) {
    if (record) {
      if (!canEditTransfer(record)) {
        showToast("warning", "Only the creator can edit open transfers.");
        return;
      }
      setTransferForm({
        id: record.id,
        fromLocationId: record.fromLocationId,
        toLocationId: record.toLocationId,
        status: record.status as TransferStatus,
        lines: record.lines ? record.lines.map((item: any) => ({
          id: item.id || `line-${Math.random()}`,
          productId: item.productId,
          name: item.name,
          availableQty: item.availableQty,
          sendQty: item.sendQty
        })) : [],
      });
    } else {
      setTransferForm({
        ...emptyTransferForm,
        fromLocationId: activeLocationId || locations[0]?.id || "",
        toLocationId: locations.find(l => l.id !== (activeLocationId || locations[0]?.id))?.id || "",
      });
    }
    setTransferModalOpen(true);
  }

  async function handleUpdateStatus(newStatus: "Pending" | "In Transit" | "Completed") {
    if (!statusUpdateTransfer || !profile?.id) return;

    try {
      const normalized = newStatus.toLowerCase().replace(" ", "_") as "pending" | "in_transit" | "completed";
      await updateStockTransferStatus(statusUpdateTransfer.id, normalized, profile.id);
      setStatusUpdateTransfer(null);
      await loadData();
      await refreshData();
      showToast("success", "Transfer status updated successfully");
    } catch (error: any) {
      showToast("error", `Failed to update status: ${error.message}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">Stock Transfers</p>
          <h1 className="mt-1 text-3xl font-bold text-ink">Stock Transfers</h1>
        </div>
        {can("Transfers", "add") && (
          <button
            onClick={() => openTransferModal()}
            className="flex items-center gap-2 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-brand-600"
          >
            <Plus size={18} />
            + New Transfer
          </button>
        )}
      </div>

      <SectionCard title="Location Stock Transfers" subtitle="Transfer inventory between warehouses and store branches">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
            <Search size={16} className="text-brand-500" />
            <input
              value={transferSearch}
              onChange={(e) => setTransferSearch(e.target.value)}
              className="w-full border-none bg-transparent text-sm outline-none font-medium"
              placeholder="Search by location, recorder or transfer #"
            />
          </label>
        </div>

        <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-[0_20px_50px_rgba(37,99,235,0.08)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                <tr>
                  {["Transfer #", "Origin Branch", "Destination Branch", "Status", "Recorder", "Date", "Actions"].map((col) => (
                    <th key={col} className="border-b border-white/10 px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-100">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-slate-100">
                {paginatedTransfers.length > 0 ? (
                  paginatedTransfers.map((transfer) => {
                    const statusColors = {
                      "Pending": "bg-amber-50 text-amber-600 border-amber-200",
                      "In Transit": "bg-blue-50 text-blue-600 border-blue-200",
                      "Completed": "bg-emerald-50 text-emerald-600 border-emerald-200"
                    };
                    
                    return (
                      <tr 
                        key={transfer.id} 
                        className="group transition hover:bg-brand-50/40 cursor-pointer"
                        onClick={() => setSelectedTransfer(transfer)}
                      >
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                            #{transfer.transferNumber || transfer.id.slice(0, 5)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-700 font-medium">
                          <div className="flex items-center gap-2">
                             {transfer.fromStock}
                             <ChevronRight size={14} className="text-slate-300" />
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-700 font-semibold">{transfer.toStock}</td>
                        <td className="px-5 py-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (canCompleteTransfer(transfer) || (transfer.status === "Pending" && canEditTransfer(transfer))) {
                                setStatusUpdateTransfer(transfer);
                              }
                            }}
                            disabled={!canCompleteTransfer(transfer) && !(transfer.status === "Pending" && canEditTransfer(transfer))}
                            className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition hover:brightness-95 disabled:hover:brightness-100 ${statusColors[transfer.status]}`}
                          >
                            <div className="flex items-center gap-1.5">
                              {transfer.status}
                              {(canCompleteTransfer(transfer) || (transfer.status === "Pending" && canEditTransfer(transfer))) && <ArrowRightLeft size={10} />}
                            </div>
                          </button>
                        </td>
                        <td className="px-5 py-4 text-slate-500 font-medium">{transfer.createdBy}</td>
                        <td className="px-5 py-4 text-slate-500">{transfer.createdAt}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {canEditTransfer(transfer) ? (
                              <button
                                onClick={() => openTransferModal(transfer)}
                                className="rounded-xl bg-sky-50 p-2 text-sky-600 transition hover:bg-sky-100"
                              >
                                <Pencil size={16} />
                              </button>
                            ) : (
                              <div className="p-2 text-slate-300 cursor-not-allowed">
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
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-400 font-medium">
                      No stock transfers found.
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

      {/* Transfer Modal */}
      {transferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setTransferModalOpen(false)}>
          <div className="w-full max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">Stock Transfer</p>
                <h2 className="mt-1 text-2xl font-bold text-ink">{transferForm.id ? "Edit Transfer" : "Create Stock Transfer"}</h2>
              </div>
              <button type="button" onClick={() => setTransferModalOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="mb-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Origin Branch (From)</p>
                <select
                  value={transferForm.fromLocationId}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, fromLocationId: e.target.value }))}
                  className="w-full rounded-xl border border-sky-100 bg-white px-4 py-2.5 text-sm font-semibold outline-none"
                >
                  <option value="" disabled>Select Source Location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Destination Branch (To)</p>
                <select
                  value={transferForm.toLocationId}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, toLocationId: e.target.value }))}
                  className="w-full rounded-xl border border-sky-100 bg-white px-4 py-2.5 text-sm font-semibold outline-none"
                >
                  <option value="" disabled>Select Destination Location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    value={transferProductSearch}
                    onChange={(e) => setTransferProductSearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-sm outline-none"
                    placeholder="Search product to add to transfer..."
                  />
                </div>
              </div>
              {transferMatches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-w-md rounded-xl border border-slate-100 bg-white py-2 shadow-lg">
                  {transferMatches.map((prod: any) => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => addTransferProduct(prod.id)}
                      className="block w-full px-4 py-2 text-left text-sm font-semibold text-ink hover:bg-slate-50"
                    >
                      {prod.name} (Stock: {prod.stock_quantity})
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-6 max-h-[30vh] overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100">
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    <th className="px-4 py-3">Product Name</th>
                    <th className="px-4 py-3">Available</th>
                    <th className="px-4 py-3">Transfer Qty</th>
                    <th className="px-4 py-3 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {transferForm.lines.length > 0 ? (
                    transferForm.lines.map((line, idx) => (
                      <tr key={line.id}>
                        <td className="px-4 py-3 font-semibold text-slate-800">{line.name}</td>
                        <td className="px-4 py-3 text-slate-500 font-medium">{line.availableQty}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="1"
                            max={line.availableQty}
                            value={line.sendQty}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value));
                              setTransferForm((prev) => {
                                const newLines = [...prev.lines];
                                newLines[idx].sendQty = val;
                                return { ...prev, lines: newLines };
                              });
                            }}
                            className="w-24 rounded-lg border border-slate-200 px-3 py-1 text-sm font-bold outline-none"
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
                            className="text-xs font-bold text-rose-500 hover:underline"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                        No products added to this transfer yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setTransferModalOpen(false)}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveTransfer}
                disabled={!transferForm.lines.length || transferForm.fromLocationId === transferForm.toLocationId}
                className="rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-bold text-white shadow-soft transition hover:bg-brand-600 disabled:opacity-50"
              >
                {transferForm.id ? "Update Transfer" : "Save Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {statusUpdateTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setStatusUpdateTransfer(null)}>
          <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-ink mb-2">Update Transfer Status</h3>
            <p className="text-xs text-slate-500 mb-6">
              Update transfer status for <strong>#{statusUpdateTransfer.transferNumber || statusUpdateTransfer.id.slice(0, 5)}</strong> ({statusUpdateTransfer.fromStock} → {statusUpdateTransfer.toStock})
            </p>
            <div className="space-y-3 mb-6">
              {(["Pending", "In Transit", "Completed"] as TransferStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleUpdateStatus(st)}
                  className={`w-full rounded-xl border p-3 text-left font-bold text-sm transition flex items-center justify-between ${
                    statusUpdateTransfer.status === st
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-brand-200"
                  }`}
                >
                  <span>{st}</span>
                  {statusUpdateTransfer.status === st && <span className="text-xs font-normal text-brand-500">(Current)</span>}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStatusUpdateTransfer(null)}
              className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* View Transfer Details Modal */}
      {selectedTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setSelectedTransfer(null)}>
          <div className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-ink">Transfer #{selectedTransfer.transferNumber || selectedTransfer.id.slice(0, 5)}</h3>
              <button type="button" onClick={() => setSelectedTransfer(null)} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 text-xs text-slate-600 mb-4 bg-slate-50 p-4 rounded-xl">
              <p><strong>From:</strong> {selectedTransfer.fromStock}</p>
              <p><strong>To:</strong> {selectedTransfer.toStock}</p>
              <p><strong>Status:</strong> {selectedTransfer.status}</p>
              <p><strong>Created By:</strong> {selectedTransfer.createdBy} ({selectedTransfer.createdAt})</p>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-100 mb-4">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 font-bold uppercase text-slate-500">
                  <tr>
                    <th className="p-2.5 text-left">Product</th>
                    <th className="p-2.5 text-right">Transfer Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedTransfer.lines?.map((item: any) => (
                    <tr key={item.id}>
                      <td className="p-2.5 font-semibold text-slate-700">{item.name}</td>
                      <td className="p-2.5 text-right font-bold text-slate-900">{item.sendQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTransfer(null)}
              className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-black"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
