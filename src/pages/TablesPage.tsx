import { useEffect, useState } from "react";
import { Plus, X, Users, Edit2, CheckCircle2, ToggleLeft, ToggleRight, QrCode, Copy, Printer, BedDouble } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { tableService } from "../services/tableService";
import { roomService } from "../services/roomService";
import { guestOrderService, type QrMenuControlProduct } from "../services/guestOrderService";
import type { DiningTableRecord, ActiveTabRecord, RoomRecord } from "../types/database";
import { formatCurrency } from "../lib/format";

const TABLE_STATUS_CONFIG = {
  available: { label: "Available", bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-700", emoji: "✅" },
  occupied:  { label: "Occupied",  bg: "bg-rose-50",    border: "border-rose-300",    text: "text-rose-700",    emoji: "🔴" },
  reserved:  { label: "Reserved",  bg: "bg-blue-50",    border: "border-blue-300",    text: "text-blue-700",    emoji: "🔵" },
};

export function TablesPage() {
  const { profile } = useAuth();
  const { showToast, confirm } = useNotification();
  const businessId = profile?.business_id || "";

  const [tables, setTables] = useState<DiningTableRecord[]>([]);
  const [openTabs, setOpenTabs] = useState<ActiveTabRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [pendingQrOrders, setPendingQrOrders] = useState(0);
  const [menuProducts, setMenuProducts] = useState<QrMenuControlProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState<ActiveTabRecord | null>(null);
  const [showTabModal, setShowTabModal] = useState(false);
  const [qrTarget, setQrTarget] = useState<{ kind: "table" | "room"; label: string; token?: string } | null>(null);
  const [showMenuControl, setShowMenuControl] = useState(false);

  const [newTable, setNewTable] = useState({ table_number: "", capacity: 4 });
  const [addLoading, setAddLoading] = useState(false);

  const loadData = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [tbls, tabs, roomData, qrOrders] = await Promise.all([
        tableService.listTables(businessId),
        tableService.listOpenTabs(businessId),
        roomService.listRooms(businessId),
        guestOrderService.listPending(businessId).catch(() => []),
      ]);
      setTables(tbls);
      setOpenTabs(tabs);
      setRooms(roomData);
      setPendingQrOrders(qrOrders.length);
    } catch (err: any) {
      showToast("error", err.message || "Failed to load tables");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [businessId]);

  const handleAddTable = async () => {
    if (!newTable.table_number) return;
    setAddLoading(true);
    try {
      await tableService.createTable({
        business_id: businessId,
        table_number: newTable.table_number,
        capacity: newTable.capacity,
      });
      showToast("success", `Table ${newTable.table_number} added!`);
      setNewTable({ table_number: "", capacity: 4 });
      setShowAddModal(false);
      loadData();
    } catch (err: any) {
      showToast("error", err.message || "Failed to add table");
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveTable = async (table: DiningTableRecord) => {
    const ok = await confirm("Remove Table", `Remove ${table.table_number}? This will deactivate it.`);
    if (!ok) return;
    try {
      await tableService.deleteTable(table.id);
      showToast("success", "Table removed.");
      loadData();
    } catch (err: any) {
      showToast("error", err.message || "Failed to remove table");
    }
  };

  const handleStatusChange = async (table: DiningTableRecord, status: 'available' | 'occupied' | 'reserved') => {
    try {
      await tableService.updateTableStatus(table.id, status);
      loadData();
    } catch (err: any) {
      showToast("error", "Failed to update table status");
    }
  };

  const getTableTab = (table: DiningTableRecord) => openTabs.find((t) => t.table_id === table.id);
  const getQrUrl = (target: { kind: "table" | "room"; token?: string }) => {
    if (!target.token) return "";
    return `${window.location.origin}/guest-order/${target.kind}/${target.token}`;
  };
  const copyQrLink = async () => {
    if (!qrTarget) return;
    const url = getQrUrl(qrTarget);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    showToast("success", "Customer menu link copied.");
  };
  const openMenuControl = async () => {
    try { setMenuProducts(await guestOrderService.listMenuControls(businessId)); setShowMenuControl(true); }
    catch (error: any) { showToast("error", error.message || "Could not load the customer menu"); }
  };
  const toggleMenuProduct = async (product: QrMenuControlProduct) => {
    try { await guestOrderService.setMenuProduct(product.id, !product.enabled); setMenuProducts((items) => items.map((item) => item.id === product.id ? { ...item, enabled: !item.enabled } : item)); }
    catch (error: any) { showToast("error", error.message || "Could not update menu product"); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Tables</h1>
          <p className="text-slate-500 font-medium mt-1">Manage bar and restaurant tables and monitor active orders.</p>
        </div>
        <div className="flex gap-2"><button onClick={() => void openMenuControl()} className="flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100"><QrCode size={17} /> Control customer menu</button><button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white shadow-lg hover:scale-[1.02] transition"><Plus size={18} /> Add Table</button></div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
          <p className="text-2xl font-black text-slate-900">{tables.length}</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Tables</p>
        </div>
        <div className="rounded-2xl bg-white border border-emerald-100 p-4 shadow-sm">
          <p className="text-2xl font-black text-emerald-700">{tables.filter(t => t.status === "available").length}</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Available</p>
        </div>
        <div className="rounded-2xl bg-white border border-rose-100 p-4 shadow-sm">
          <p className="text-2xl font-black text-rose-700">{tables.filter(t => t.status === "occupied").length}</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Occupied</p>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
          <p className="text-2xl font-black text-indigo-700">{pendingQrOrders}</p>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">QR orders waiting</p>
        </div>
      </div>

      {/* Table grid */}
      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
        </div>
      ) : tables.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 py-20">
          <p className="text-lg font-black text-slate-500 mb-2">No tables added yet</p>
          <button onClick={() => setShowAddModal(true)} className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">
            Add First Table
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {tables.map((table) => {
            const cfg = TABLE_STATUS_CONFIG[table.status as keyof typeof TABLE_STATUS_CONFIG] || TABLE_STATUS_CONFIG.available;
            const activeTab = getTableTab(table);
            return (
              <div key={table.id} className={`rounded-2xl border-2 bg-white p-4 shadow-sm transition ${cfg.border}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xl font-black text-slate-900">T{table.table_number}</p>
                  <span className="text-lg">{cfg.emoji}</span>
                </div>
                <div className="flex items-center gap-1 mb-2">
                  <Users size={12} className="text-slate-400" />
                  <span className="text-xs text-slate-400">{table.capacity} seats</span>
                </div>

                <span className={`inline-block rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${cfg.bg} ${cfg.text} mb-3`}>
                  {cfg.label}
                </span>

                {activeTab && (
                  <button
                    onClick={() => { setSelectedTab(activeTab); setShowTabModal(true); }}
                    className="w-full mb-2 rounded-xl bg-rose-50 border border-rose-200 px-2 py-1.5 text-[10px] font-black text-rose-700 hover:bg-rose-100 transition"
                  >
                    Open Tab: {formatCurrency(activeTab.total)}
                  </button>
                )}

                <div className="space-y-1.5">
                  <select
                    value={table.status}
                    onChange={(e) => handleStatusChange(table, e.target.value as any)}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-600 p-1.5 outline-none appearance-none"
                  >
                    <option value="available">Available</option>
                    <option value="occupied">Occupied</option>
                    <option value="reserved">Reserved</option>
                  </select>
                  <button onClick={() => handleRemoveTable(table)} className="w-full rounded-xl bg-slate-50 border border-slate-200 py-1.5 text-[10px] font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition">
                    Remove
                  </button>
                  <button onClick={() => setQrTarget({ kind: "table", label: `Table ${table.table_number}`, token: table.qr_token })} className="flex w-full items-center justify-center gap-1 rounded-xl bg-indigo-50 border border-indigo-100 py-1.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100 transition">
                    <QrCode size={12} /> Customer QR
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-2xl bg-violet-50 p-2.5 text-violet-700"><BedDouble size={20} /></div>
          <div><h2 className="font-black text-slate-900">Room QR codes</h2><p className="text-xs text-slate-500">Print one QR code per room for guest room-service ordering.</p></div>
        </div>
        {rooms.length === 0 ? <p className="py-4 text-sm text-slate-400">Add rooms first to generate room QR codes.</p> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {rooms.map((room) => (
              <div key={room.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div><p className="font-black text-slate-800">Room {room.room_number}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{room.room_type}</p></div>
                <button onClick={() => setQrTarget({ kind: "room", label: `Room ${room.room_number}`, token: room.qr_token })} className="rounded-xl bg-white p-2 text-violet-700 shadow-sm hover:bg-violet-50" title="Open room QR"><QrCode size={18} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Open Tabs section */}
      {false && openTabs.length > 0 && (
        <div>
          <h2 className="text-lg font-black text-slate-900 mb-3">Open Tabs / Held Orders</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {openTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setSelectedTab(tab); setShowTabModal(true); }}
                className="flex items-center justify-between rounded-2xl bg-white border border-slate-200 p-4 shadow-sm text-left hover:border-amber-400 hover:shadow-md transition"
              >
                <div>
                  <p className="font-bold text-slate-900">{tab.tab_name}</p>
                  <p className="text-xs text-slate-400">{Array.isArray(tab.cart_items) ? tab.cart_items.length : 0} items • {new Date(tab.created_at).toLocaleTimeString()}</p>
                </div>
                <p className="text-base font-black text-amber-600">{formatCurrency(tab.total)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {showMenuControl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-900">Control customer QR menu</h2><p className="text-sm text-slate-500">Enable products customers can see and order. Prices use the main product catalogue.</p></div><button onClick={() => setShowMenuControl(false)} className="rounded-full bg-slate-100 p-2 text-slate-600"><X size={18}/></button></div>
            <div className="overflow-y-auto rounded-2xl border border-slate-100"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">QR menu</th></tr></thead><tbody className="divide-y divide-slate-100">{menuProducts.map((product) => <tr key={product.id}><td className="px-4 py-3 font-bold text-slate-800">{product.name}</td><td className="px-4 py-3 text-xs text-slate-500">{product.category}</td><td className="px-4 py-3 text-right font-bold text-slate-700">{formatCurrency(product.price)}</td><td className="px-4 py-3 text-right"><button onClick={() => void toggleMenuProduct(product)} className={`rounded-xl px-3 py-1.5 text-xs font-black ${product.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{product.enabled ? "Visible" : "Hidden"}</button></td></tr>)}{!menuProducts.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">No active products found.</td></tr>}</tbody></table></div>
          </div>
        </div>
      )}

      {/* ========== ADD TABLE MODAL ========== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-900">Add New Table</h2>
              <button onClick={() => setShowAddModal(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Table Number / Name</label>
                <input type="text" className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-400 text-slate-900"
                  placeholder="e.g. 1 or VIP" value={newTable.table_number}
                  onChange={(e) => setNewTable({ ...newTable, table_number: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Seating Capacity</label>
                <input type="number" min={1} className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-400 text-slate-900"
                  value={newTable.capacity}
                  onChange={(e) => setNewTable({ ...newTable, capacity: parseInt(e.target.value) || 1 })} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="flex-1 rounded-2xl bg-slate-100 py-3 font-bold text-slate-600 hover:bg-slate-200 transition">Cancel</button>
              <button onClick={handleAddTable} disabled={addLoading || !newTable.table_number}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-slate-950 py-3 font-bold text-white hover:bg-slate-800 transition disabled:opacity-50">
                {addLoading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Plus size={16} />}
                Add Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== TAB DETAILS MODAL ========== */}
      {showTabModal && selectedTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-slate-900">{selectedTab.tab_name}</h2>
              <button onClick={() => setShowTabModal(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {(selectedTab.cart_items || []).map((item: any, i: number) => (
                <div key={i} className="flex justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                  <span className="text-slate-700">{item.quantity}x {item.name}</span>
                  <span className="font-black text-slate-900">{formatCurrency(item.line_total)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-3 font-black text-base">
              <span>Total</span>
              <span className="text-amber-600">{formatCurrency(selectedTab.total)}</span>
            </div>
            <button onClick={() => setShowTabModal(false)} className="mt-4 w-full rounded-2xl bg-slate-100 py-3 font-bold text-slate-600 hover:bg-slate-200 transition">Close</button>
          </div>
        </div>
      )}

      {qrTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl">
            <div className="mb-4 flex items-center justify-between text-left"><div><h2 className="text-xl font-black text-slate-900">Customer menu QR</h2><p className="text-sm font-medium text-slate-500">{qrTarget.label}</p></div><button onClick={() => setQrTarget(null)} className="rounded-full bg-slate-100 p-2 text-slate-600"><X size={18} /></button></div>
            {qrTarget.token ? <img className="mx-auto h-52 w-52 rounded-xl border border-slate-100 bg-white p-2" alt={`${qrTarget.label} customer menu QR`} src={`https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=8&data=${encodeURIComponent(getQrUrl(qrTarget))}`} /> : <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-bold text-amber-700">Apply the QR-token migration, then refresh this page.</div>}
            <p className="mt-4 break-all rounded-xl bg-slate-50 p-3 text-left text-[10px] font-medium text-slate-500">{getQrUrl(qrTarget) || "QR token is not available yet"}</p>
            <div className="mt-4 grid grid-cols-2 gap-3"><button disabled={!qrTarget.token} onClick={() => void copyQrLink()} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-700 disabled:opacity-50"><Copy size={16} /> Copy link</button><button onClick={() => window.print()} disabled={!qrTarget.token} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-950 py-3 text-sm font-bold text-white disabled:opacity-50"><Printer size={16} /> Print QR</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
