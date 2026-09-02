import { useEffect, useState } from "react";
import {
  BedDouble, Plus, X, CheckCircle2, LogOut, Clock, Users,
  User, Phone, CreditCard, Smartphone, Wallet, Edit2, AlertCircle,
  TrendingUp, Hotel, Wrench, RefreshCw,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { roomService } from "../services/roomService";
import { formatCurrency } from "../lib/format";
import type { RoomRecord, RoomBookingRecord, RoomStatus } from "../types/database";

type CheckInFormState = {
  guest_name: string;
  guest_phone: string;
  guest_nationality: string;
  guest_id_passport: string;
  number_of_guests: number;
  expected_checkout: string;
  room_rate: number;
  advance_paid: number;
  notes: string;
};

const STATUS_CONFIG: Record<RoomStatus, { label: string; color: string; bg: string; border: string }> = {
  available:    { label: "Available",    color: "text-emerald-600", bg: "bg-emerald-50",  border: "border-emerald-200" },
  occupied:     { label: "Occupied",     color: "text-rose-600",    bg: "bg-rose-50",     border: "border-rose-200" },
  reserved:     { label: "Reserved",     color: "text-blue-600",    bg: "bg-blue-50",     border: "border-blue-200" },
  cleaning:     { label: "Cleaning",     color: "text-amber-600",   bg: "bg-amber-50",    border: "border-amber-200" },
  maintenance:  { label: "Maintenance",  color: "text-slate-600",   bg: "bg-slate-100",   border: "border-slate-200" },
};

const STATUS_EMOJI: Record<RoomStatus, string> = {
  available: "✅",
  occupied: "🔴",
  reserved: "🔵",
  cleaning: "🧹",
  maintenance: "🔧",
};

export function RoomsPage() {
  const { profile } = useAuth();
  const { showToast, confirm } = useNotification();
  const businessId = profile?.business_id || "";

  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [bookingHistory, setBookingHistory] = useState<RoomBookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({ totalRooms: 0, availableRooms: 0, occupiedRooms: 0, reservedRooms: 0, cleaningRooms: 0, pendingRoomPayments: 0, activeBookingsCount: 0 });

  // Selected room for actions
  const [selectedRoom, setSelectedRoom] = useState<RoomRecord | null>(null);

  // Modals
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [showFolioModal, setShowFolioModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<RoomBookingRecord | null>(null);

  // Check-in form
  const defaultForm: CheckInFormState = {
    guest_name: "", guest_phone: "", guest_nationality: "Rwandan", guest_id_passport: "",
    number_of_guests: 1, expected_checkout: "", room_rate: 0, advance_paid: 0, notes: "",
  };
  const [checkInForm, setCheckInForm] = useState<CheckInFormState>(defaultForm);
  const [checkInLoading, setCheckInLoading] = useState(false);

  // Checkout state
  const [finalPayment, setFinalPayment] = useState(0);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<'cash' | 'momo' | 'card' | 'bank'>('cash');
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Add room form
  const [newRoom, setNewRoom] = useState({ room_number: "", room_type: "Standard", price_per_night: 0, capacity: 2, floor: "Floor 1" });
  const [addRoomLoading, setAddRoomLoading] = useState(false);

  const loadData = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [roomsData, kpiData, historyData] = await Promise.all([
        roomService.listRooms(businessId),
        roomService.getRoomDashboardKPIs(businessId),
        roomService.listBookingHistory(businessId),
      ]);
      const detailedRooms = roomsData.map((room) => ({
        ...room,
        active_booking: historyData.find((booking) => booking.room_id === room.id && (booking.status === "checked_in" || booking.status === "reserved")) || room.active_booking || null,
      }));
      setRooms(detailedRooms);
      setBookingHistory(historyData);
      setKpis(kpiData);
    } catch (err: any) {
      showToast("error", err.message || "Failed to load rooms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [businessId]);

  const openCheckIn = (room: RoomRecord) => {
    setSelectedRoom(room);
    setCheckInForm({ ...defaultForm, room_rate: room.price_per_night });
    setShowCheckInModal(true);
  };

  const handleCheckIn = async () => {
    if (!selectedRoom || !checkInForm.guest_name) return;
    setCheckInLoading(true);
    try {
      await roomService.checkInGuest({
        business_id: businessId,
        room_id: selectedRoom.id,
        guest_name: checkInForm.guest_name,
        guest_phone: checkInForm.guest_phone || undefined,
        guest_nationality: checkInForm.guest_nationality,
        guest_id_passport: checkInForm.guest_id_passport || undefined,
        number_of_guests: checkInForm.number_of_guests,
        expected_checkout: checkInForm.expected_checkout ? new Date(checkInForm.expected_checkout).toISOString() : undefined,
        room_rate: checkInForm.room_rate,
        advance_paid: checkInForm.advance_paid,
        notes: checkInForm.notes || undefined,
        created_by: profile?.id,
      });
      showToast("success", `${checkInForm.guest_name} checked in to Room ${selectedRoom.room_number} ✅`);
      setShowCheckInModal(false);
      setCheckInForm(defaultForm);
      loadData();
    } catch (err: any) {
      showToast("error", err.message || "Check-in failed");
    } finally {
      setCheckInLoading(false);
    }
  };

  const openCheckout = (room: RoomRecord) => {
    if (!room.active_booking) return;
    setSelectedRoom(room);
    setSelectedBooking(room.active_booking as any);
    const balance = (room.active_booking as any).balance_remaining || 0;
    setFinalPayment(balance);
    setShowCheckoutModal(true);
  };

  const handleCheckout = async () => {
    if (!selectedRoom || !selectedBooking) return;
    const confirmed = await confirm(
      "Check Out Guest",
      `Check out ${selectedBooking.guest_name} from Room ${selectedRoom.room_number}? This will mark the room as Cleaning.`
    );
    if (!confirmed) return;
    setCheckoutLoading(true);
    try {
      await roomService.checkoutBooking(selectedBooking.id, selectedRoom.id, finalPayment, checkoutPaymentMethod, profile?.id);
      showToast("success", `${selectedBooking.guest_name} checked out. Room ${selectedRoom.room_number} marked for cleaning.`);
      setShowCheckoutModal(false);
      loadData();
    } catch (err: any) {
      showToast("error", err.message || "Checkout failed");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleStatusChange = async (room: RoomRecord, newStatus: RoomStatus) => {
    try {
      await roomService.updateRoomStatus(room.id, newStatus);
      showToast("success", `Room ${room.room_number} marked as ${newStatus}`);
      loadData();
    } catch (err: any) {
      showToast("error", err.message || "Status update failed");
    }
  };

  const handleAddRoom = async () => {
    if (!newRoom.room_number || !newRoom.room_type || newRoom.price_per_night <= 0) {
      showToast("error", "Please fill in Room Number, Type and Price");
      return;
    }
    setAddRoomLoading(true);
    try {
      await roomService.createRoom({
        business_id: businessId,
        room_number: newRoom.room_number,
        room_type: newRoom.room_type,
        price_per_night: newRoom.price_per_night,
        capacity: newRoom.capacity,
        floor: newRoom.floor,
      });
      showToast("success", `Room ${newRoom.room_number} added!`);
      setShowAddRoomModal(false);
      setNewRoom({ room_number: "", room_type: "Standard", price_per_night: 0, capacity: 2, floor: "Floor 1" });
      loadData();
    } catch (err: any) {
      showToast("error", err.message || "Failed to add room");
    } finally {
      setAddRoomLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Room Management</h1>
          <p className="text-slate-500 font-medium mt-1">Guest check-in, check-out and room folio management.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadData} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition">
            <RefreshCw size={16} />
            Refresh
          </button>
          <button onClick={() => setShowAddRoomModal(true)} className="flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white shadow-lg hover:scale-[1.02] transition">
            <Plus size={18} />
            Add Room
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total Rooms", value: kpis.totalRooms, icon: Hotel, color: "text-slate-900", bg: "bg-slate-100" },
          { label: "Available", value: kpis.availableRooms, icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-50" },
          { label: "Occupied", value: kpis.occupiedRooms, icon: Users, color: "text-rose-700", bg: "bg-rose-50" },
          { label: "Reserved", value: kpis.reservedRooms, icon: Clock, color: "text-blue-700", bg: "bg-blue-50" },
          { label: "Cleaning", value: kpis.cleaningRooms, icon: RefreshCw, color: "text-amber-700", bg: "bg-amber-50" },
          { label: "Unpaid Balance", value: formatCurrency(kpis.pendingRoomPayments), icon: TrendingUp, color: "text-purple-700", bg: "bg-purple-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
            <div className={`inline-flex rounded-xl p-2 ${bg} mb-3`}>
              <Icon size={18} className={color} />
            </div>
            <p className={`text-xl font-black ${color}`}>{value}</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Room Grid */}
      {loading ? (
        <div className="flex justify-center py-20 text-slate-400">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 py-20">
          <Hotel size={48} className="mb-4 text-slate-300" />
          <p className="text-lg font-black text-slate-500">No rooms added yet</p>
          <p className="text-sm text-slate-400 mb-4">Click "Add Room" to start adding rooms.</p>
          <button onClick={() => setShowAddRoomModal(true)} className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">
            Add First Room
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rooms.map((room) => {
            const cfg = STATUS_CONFIG[room.status];
            const booking = room.active_booking as any;
            return (
              <div key={room.id} className={`rounded-2xl border-2 bg-white p-4 shadow-sm transition hover:shadow-md ${cfg.border}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-2xl font-black text-slate-900">{room.room_number}</p>
                    <p className="text-xs text-slate-400 font-medium">{room.room_type}</p>
                  </div>
                  <span className={`text-lg`}>{STATUS_EMOJI[room.status]}</span>
                </div>

                <span className={`inline-block rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${cfg.bg} ${cfg.color} mb-3`}>
                  {cfg.label}
                </span>

                {booking && (
                  <div className="mb-3 rounded-xl bg-slate-50 p-2">
                    <p className="text-xs font-bold text-slate-900 truncate">{booking.guest_name}</p>
                    {booking.expected_checkout && (
                      <p className="text-[10px] text-slate-400">Out: {new Date(booking.expected_checkout).toLocaleDateString()}</p>
                    )}
                    <p className="text-[10px] text-amber-600 font-bold">
                      Bal: {formatCurrency((booking.balance_remaining || room.price_per_night))}
                    </p>
                  </div>
                )}

                <p className="text-sm font-black text-slate-700 mb-3">{formatCurrency(room.price_per_night)}<span className="text-[10px] text-slate-400 font-normal">/night</span></p>

                <div className="space-y-1.5">
                  {room.status === "available" && (
                    <button onClick={() => openCheckIn(room)} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2 text-[11px] font-black text-white hover:bg-emerald-600 transition">
                      <User size={12} /> Check In
                    </button>
                  )}
                  {room.status === "occupied" && (
                    <>
                      <button onClick={() => openCheckout(room)} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-500 py-2 text-[11px] font-black text-white hover:bg-rose-600 transition">
                        <LogOut size={12} /> Check Out
                      </button>
                      <button onClick={() => { setSelectedBooking(booking); setShowFolioModal(true); }} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-50 py-2 text-[11px] font-black text-blue-700 hover:bg-blue-100 transition">
                        <TrendingUp size={12} /> View Folio
                      </button>
                    </>
                  )}
                  {room.status === "cleaning" && (
                    <button onClick={() => handleStatusChange(room, "available")} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-2 text-[11px] font-black text-emerald-700 hover:bg-emerald-100 transition">
                      <CheckCircle2 size={12} /> Mark Ready
                    </button>
                  )}
                  {room.status === "maintenance" && (
                    <button onClick={() => handleStatusChange(room, "available")} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-[11px] font-black text-slate-700 hover:bg-slate-200 transition">
                      <CheckCircle2 size={12} /> Mark Available
                    </button>
                  )}
                  {/* Quick status change */}
                  <select
                    value={room.status}
                    onChange={(e) => handleStatusChange(room, e.target.value as RoomStatus)}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-600 p-1.5 outline-none appearance-none"
                  >
                    <option value="available">Available</option>
                    <option value="reserved">Reserved</option>
                    <option value="cleaning">Cleaning</option>
                    <option value="maintenance">Maintenance</option>
                    {room.status === "occupied" && <option value="occupied">Occupied</option>}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Guest stay and folio history */}
      <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900">Guest stay & folio history</h2>
            <p className="text-xs font-medium text-slate-500">Room charges include bar and kitchen orders, with the staff member who accepted each order.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{bookingHistory.length} record(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Guest / Room</th>
                <th className="px-5 py-3">Stay dates</th>
                <th className="px-5 py-3 text-right">Room rate</th>
                <th className="px-5 py-3 text-right">Bar & kitchen</th>
                <th className="px-5 py-3 text-right">Paid</th>
                <th className="px-5 py-3 text-right">Balance</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bookingHistory.map((booking) => {
                const foodAndBar = (booking.charges || [])
                  .filter((charge: any) => charge.service_type === "bar" || charge.service_type === "food")
                  .reduce((sum: number, charge: any) => sum + Number(charge.amount || 0), 0);
                const paid = Number(booking.advance_paid || 0) + Number(booking.total_payments || 0);
                const isOpen = booking.status === "checked_in" || booking.status === "reserved";
                return (
                  <tr key={booking.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-900">{booking.guest_name}</p>
                      <p className="text-xs text-slate-500">Room {booking.room?.room_number || "—"} · {booking.guest_phone || "No phone"}</p>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-600">
                      <p>In: {new Date(booking.check_in).toLocaleDateString()}</p>
                      <p>Out: {booking.check_out ? new Date(booking.check_out).toLocaleDateString() : booking.expected_checkout ? `Expected ${new Date(booking.expected_checkout).toLocaleDateString()}` : "Active stay"}</p>
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-slate-700">{formatCurrency(booking.room_rate)}</td>
                    <td className="px-5 py-4 text-right font-bold text-amber-700">{formatCurrency(foodAndBar)}</td>
                    <td className="px-5 py-4 text-right font-bold text-emerald-700">{formatCurrency(paid)}</td>
                    <td className="px-5 py-4 text-right font-black text-rose-600">{formatCurrency(booking.balance_remaining || 0)}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${isOpen ? "bg-blue-50 text-blue-700" : booking.status === "checked_out" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{booking.status.replace("_", " ")}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => { setSelectedBooking(booking); setShowFolioModal(true); }} className="rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white transition hover:bg-slate-700">View folio</button>
                    </td>
                  </tr>
                );
              })}
              {!bookingHistory.length && !loading && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">No guest booking history yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ========== CHECK-IN MODAL ========== */}
      {showCheckInModal && selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95 my-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">Check In Guest</h2>
                <p className="text-sm text-slate-500">Room {selectedRoom.room_number} — {selectedRoom.room_type}</p>
              </div>
              <button onClick={() => setShowCheckInModal(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Guest Full Name *</label>
                  <input type="text" className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-400 text-slate-900"
                    placeholder="e.g. John Doe" value={checkInForm.guest_name}
                    onChange={(e) => setCheckInForm({ ...checkInForm, guest_name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Phone</label>
                  <input type="tel" className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-400 text-slate-900"
                    placeholder="+250..." value={checkInForm.guest_phone}
                    onChange={(e) => setCheckInForm({ ...checkInForm, guest_phone: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Nationality</label>
                  <input type="text" className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-400 text-slate-900"
                    value={checkInForm.guest_nationality}
                    onChange={(e) => setCheckInForm({ ...checkInForm, guest_nationality: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">ID / Passport No.</label>
                  <input type="text" className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-400 text-slate-900"
                    placeholder="ID or passport" value={checkInForm.guest_id_passport}
                    onChange={(e) => setCheckInForm({ ...checkInForm, guest_id_passport: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">No. of Guests</label>
                  <input type="number" min={1} className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-400 text-slate-900"
                    value={checkInForm.number_of_guests}
                    onChange={(e) => setCheckInForm({ ...checkInForm, number_of_guests: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Expected Check-out</label>
                  <input type="date" className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-400 text-slate-900"
                    value={checkInForm.expected_checkout}
                    onChange={(e) => setCheckInForm({ ...checkInForm, expected_checkout: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Room Rate / Night</label>
                  <input type="number" className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-400 text-slate-900"
                    value={checkInForm.room_rate}
                    onChange={(e) => setCheckInForm({ ...checkInForm, room_rate: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Advance Deposit</label>
                  <input type="number" className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-400 text-slate-900"
                    placeholder="0" value={checkInForm.advance_paid || ""}
                    onChange={(e) => setCheckInForm({ ...checkInForm, advance_paid: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Notes</label>
                  <textarea rows={2} className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-400 text-slate-900 resize-none"
                    placeholder="Any special notes..." value={checkInForm.notes}
                    onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCheckInModal(false)} className="flex-1 rounded-2xl bg-slate-100 py-3 font-bold text-slate-600 hover:bg-slate-200 transition">
                Cancel
              </button>
              <button onClick={handleCheckIn} disabled={checkInLoading || !checkInForm.guest_name}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 font-bold text-white hover:bg-emerald-600 transition disabled:opacity-50">
                {checkInLoading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <CheckCircle2 size={16} />}
                Confirm Check-In
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== CHECKOUT MODAL ========== */}
      {showCheckoutModal && selectedRoom && selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-900">Guest Checkout</h2>
              <button onClick={() => setShowCheckoutModal(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Guest</span>
                <span className="font-bold text-slate-900">{selectedBooking.guest_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Room</span>
                <span className="font-bold text-slate-900">{selectedRoom.room_number} ({selectedRoom.room_type})</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Room Rate</span>
                <span className="font-bold text-slate-900">{formatCurrency(selectedBooking.room_rate)}/night</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Advance Paid</span>
                <span className="font-bold text-emerald-600">-{formatCurrency(selectedBooking.advance_paid)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
                <span className="text-slate-700 font-black">Balance Due</span>
                <span className="font-black text-rose-600">{formatCurrency((selectedBooking as any).balance_remaining || 0)}</span>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Final Payment Received</label>
              <input type="number" className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-xl font-black text-slate-900 outline-none focus:border-slate-400"
                value={finalPayment}
                onChange={(e) => setFinalPayment(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="mb-6">
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">Payment Method</label>
              <select value={checkoutPaymentMethod} onChange={(e) => setCheckoutPaymentMethod(e.target.value as typeof checkoutPaymentMethod)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500">
                <option value="cash">Cash</option>
                <option value="momo">Mobile Money</option>
                <option value="card">Card</option>
                <option value="bank">Bank</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowCheckoutModal(false)} className="flex-1 rounded-2xl bg-slate-100 py-3 font-bold text-slate-600 hover:bg-slate-200 transition">
                Cancel
              </button>
              <button onClick={handleCheckout} disabled={checkoutLoading}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-rose-500 py-3 font-bold text-white hover:bg-rose-600 transition disabled:opacity-50">
                {checkoutLoading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <LogOut size={16} />}
                Confirm Checkout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== FOLIO MODAL ========== */}
      {showFolioModal && selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-900">Room Folio — {selectedBooking.guest_name}</h2>
              <button onClick={() => setShowFolioModal(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3 text-xs">
              <div><p className="font-bold text-slate-400">ROOM / STAY</p><p className="mt-0.5 font-black text-slate-800">{selectedBooking.room?.room_number || "—"} · {new Date(selectedBooking.check_in).toLocaleDateString()}</p></div>
              <div><p className="font-bold text-slate-400">GUEST CONTACT</p><p className="mt-0.5 font-black text-slate-800">{selectedBooking.guest_phone || "No phone recorded"}</p></div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              <div className="flex justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <span className="text-slate-600">🛏️ Room Base Rate</span>
                <span className="font-black text-slate-900">{formatCurrency(selectedBooking.room_rate)}</span>
              </div>
              {((selectedBooking as any).charges || []).map((c: any, i: number) => (
                <div key={i} className="rounded-xl bg-amber-50 px-4 py-3 text-sm">
                  <span className="text-slate-600">
                    {c.service_type === "bar" ? "🍺" : c.service_type === "food" ? "🍗" : "📦"} {c.description}
                  </span>
                  <span className="font-bold text-slate-900">{formatCurrency(c.amount)}</span>
                  <p className="mt-1 text-[10px] font-medium text-slate-500">{new Date(c.created_at).toLocaleString()} · Accepted by: {c.users?.full_name || "Staff record unavailable"}</p>
                </div>
              ))}
            </div>

            {((selectedBooking as any).payments || []).length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reception payments</p>
                {((selectedBooking as any).payments || []).map((payment: any) => (
                  <div key={payment.id} className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2.5 text-xs">
                    <span className="font-bold text-emerald-800">{payment.payment_method.toUpperCase()} · {payment.users?.full_name || "Reception"}</span>
                    <span className="font-black text-emerald-700">-{formatCurrency(payment.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Advance Paid</span>
                <span className="text-emerald-400 font-bold">-{formatCurrency(selectedBooking.advance_paid)}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Later Payments</span>
                <span className="text-emerald-400 font-bold">-{formatCurrency((selectedBooking as any).total_payments || 0)}</span>
              </div>
              <div className="flex justify-between text-base font-black">
                <span>Balance Due</span>
                <span className="text-rose-400">{formatCurrency((selectedBooking as any).balance_remaining || 0)}</span>
              </div>
            </div>

            <button onClick={() => setShowFolioModal(false)} className="mt-4 w-full rounded-2xl bg-slate-100 py-3 font-bold text-slate-600 hover:bg-slate-200 transition">
              Close
            </button>
          </div>
        </div>
      )}

      {/* ========== ADD ROOM MODAL ========== */}
      {showAddRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-900">Add New Room</h2>
              <button onClick={() => setShowAddRoomModal(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {[
                { label: "Room Number", key: "room_number", type: "text", placeholder: "e.g. 101" },
                { label: "Floor", key: "floor", type: "text", placeholder: "e.g. Floor 1" },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">{label}</label>
                  <input type={type} className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-400 text-slate-900"
                    placeholder={placeholder} value={(newRoom as any)[key]}
                    onChange={(e) => setNewRoom({ ...newRoom, [key]: e.target.value })} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Room Type</label>
                <select className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none appearance-none text-slate-900"
                  value={newRoom.room_type} onChange={(e) => setNewRoom({ ...newRoom, room_type: e.target.value })}>
                  {["Standard", "Deluxe", "Suite", "VIP Suite", "Family Room", "Single"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Price / Night</label>
                  <input type="number" className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-400 text-slate-900"
                    placeholder="0" value={newRoom.price_per_night || ""}
                    onChange={(e) => setNewRoom({ ...newRoom, price_per_night: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Capacity</label>
                  <input type="number" min={1} className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-slate-400 text-slate-900"
                    value={newRoom.capacity}
                    onChange={(e) => setNewRoom({ ...newRoom, capacity: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowAddRoomModal(false)} className="flex-1 rounded-2xl bg-slate-100 py-3 font-bold text-slate-600 hover:bg-slate-200 transition">
                Cancel
              </button>
              <button onClick={handleAddRoom} disabled={addRoomLoading}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-slate-950 py-3 font-bold text-white hover:bg-slate-800 transition disabled:opacity-50">
                {addRoomLoading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Plus size={16} />}
                Add Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
