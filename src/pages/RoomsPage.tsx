import { useEffect, useState, useMemo } from "react";
import {
  BedDouble, Plus, X, CheckCircle2, LogOut, Clock, Users,
  User, Phone, CreditCard, Smartphone, Wallet, Edit2, AlertCircle,
  TrendingUp, Hotel, Wrench, RefreshCw, Search, Filter,
  Calendar, Check, UserCheck, CalendarClock, Sparkles, FileText,
  DollarSign, ChevronDown, Layers, ArrowRight, Printer, ChevronLeft,
  ChevronRight, Utensils, Trash2, ShieldAlert, QrCode, Copy
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { roomService } from "../services/roomService";
import { formatCurrency } from "../lib/format";
import { SectionCard } from "../components/ui/SectionCard";
import type { RoomRecord, RoomBookingRecord, RoomStatus } from "../types/database";

export type AdditionalGuest = {
  name: string;
  phone_country_code: string;
  phone: string;
  nationality: string;
  id_document_type: "rwanda_id" | "passport";
  id_passport: string;
};

type CheckInFormState = {
  guest_name: string;
  guest_phone_country_code: string;
  guest_phone: string;
  guest_nationality: string;
  id_document_type: "rwanda_id" | "passport";
  guest_id_passport: string;
  number_of_guests: number;
  additional_guests: AdditionalGuest[];
  expected_checkout: string;
  room_rate: number;
  advance_paid: number;
  notes: string;
};

// Common country phone codes for international and regional hospitality
const COUNTRY_CODES = [
  { code: "+250", label: "🇷🇼 Rwanda (+250)", country: "Rwanda", nationality: "Rwandan" },
  { code: "+256", label: "🇺🇬 Uganda (+256)", country: "Uganda", nationality: "Ugandan" },
  { code: "+254", label: "🇰🇪 Kenya (+254)", country: "Kenya", nationality: "Kenyan" },
  { code: "+257", label: "🇧🇮 Burundi (+257)", country: "Burundi", nationality: "Burundian" },
  { code: "+255", label: "🇹🇿 Tanzania (+255)", country: "Tanzania", nationality: "Tanzanian" },
  { code: "+243", label: "🇨🇩 DR Congo (+243)", country: "DR Congo", nationality: "Congolese" },
  { code: "+1", label: "🇺🇸/🇨🇦 USA / Canada (+1)", country: "United States", nationality: "American" },
  { code: "+44", label: "🇬🇧 UK (+44)", country: "United Kingdom", nationality: "British" },
  { code: "+33", label: "🇫🇷 France (+33)", country: "France", nationality: "French" },
  { code: "+49", label: "🇩🇪 Germany (+49)", country: "Germany", nationality: "German" },
  { code: "+32", label: "🇧🇪 Belgium (+32)", country: "Belgium", nationality: "Belgian" },
  { code: "+86", label: "🇨🇳 China (+86)", country: "China", nationality: "Chinese" },
  { code: "+91", label: "🇮🇳 India (+91)", country: "India", nationality: "Indian" },
  { code: "+971", label: "🇦🇪 UAE (+971)", country: "UAE", nationality: "Emirati" },
  { code: "+27", label: "🇿🇦 South Africa (+27)", country: "South Africa", nationality: "South African" },
];

const getTomorrowDateString = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split("T")[0];
};

const getTodayDateString = () => {
  return new Date().toISOString().split("T")[0];
};

const STATUS_CONFIG: Record<
  RoomStatus,
  { label: string; text: string; bg: string; border: string; dot: string; cardBorder: string }
> = {
  available: {
    label: "Available",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
    cardBorder: "border-slate-200 hover:border-emerald-300",
  },
  occupied: {
    label: "Occupied",
    text: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
    dot: "bg-rose-500",
    cardBorder: "border-rose-200 hover:border-rose-300",
  },
  reserved: {
    label: "Reserved",
    text: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    dot: "bg-blue-500",
    cardBorder: "border-blue-200 hover:border-blue-300",
  },
  cleaning: {
    label: "Cleaning",
    text: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    dot: "bg-amber-500",
    cardBorder: "border-amber-200 hover:border-amber-300",
  },
  maintenance: {
    label: "Maintenance",
    text: "text-slate-700",
    bg: "bg-slate-100",
    border: "border-slate-300",
    dot: "bg-slate-500",
    cardBorder: "border-slate-200 hover:border-slate-300",
  },
};

export function RoomsPage() {
  const { profile } = useAuth();
  const { showToast, confirm } = useNotification();
  const businessId = profile?.business_id || "";

  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [bookingHistory, setBookingHistory] = useState<RoomBookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    totalRooms: 0,
    availableRooms: 0,
    occupiedRooms: 0,
    reservedRooms: 0,
    cleaningRooms: 0,
    pendingRoomPayments: 0,
    activeBookingsCount: 0,
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [floorFilter, setFloorFilter] = useState<string>("all");
  const [roomSearchQuery, setRoomSearchQuery] = useState("");

  // Table pagination & filters
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [historyPage, setHistoryPage] = useState(1);
  const historyPerPage = 10;

  // Selected records
  const [selectedRoom, setSelectedRoom] = useState<RoomRecord | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<RoomBookingRecord | null>(null);

  // Modals
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [showEditRoomModal, setShowEditRoomModal] = useState(false);
  const [showFolioModal, setShowFolioModal] = useState(false);
  const [qrTargetRoom, setQrTargetRoom] = useState<RoomRecord | null>(null);

  // Forms
  const defaultForm: CheckInFormState = {
    guest_name: "",
    guest_phone_country_code: "+250",
    guest_phone: "",
    guest_nationality: "Rwandan",
    id_document_type: "rwanda_id",
    guest_id_passport: "",
    number_of_guests: 1,
    additional_guests: [],
    expected_checkout: getTomorrowDateString(),
    room_rate: 0,
    advance_paid: 0,
    notes: "",
  };
  const [checkInForm, setCheckInForm] = useState<CheckInFormState>(defaultForm);
  const [checkInLoading, setCheckInLoading] = useState(false);

  // Payment modal state
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "momo" | "card" | "bank">("cash");
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Checkout state
  const [finalPayment, setFinalPayment] = useState(0);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<
    "cash" | "momo" | "card" | "bank"
  >("cash");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Add room form
  const [newRoom, setNewRoom] = useState({
    room_number: "",
    room_type: "Standard",
    price_per_night: 0,
    capacity: 2,
    floor: "Floor 1",
  });
  const [addRoomLoading, setAddRoomLoading] = useState(false);

  // Edit room form
  const [editingRoom, setEditingRoom] = useState<RoomRecord | null>(null);
  const [editRoomForm, setEditRoomForm] = useState({
    room_number: "",
    room_type: "Standard",
    price_per_night: 0,
    capacity: 2,
    floor: "Floor 1",
  });
  const [editRoomLoading, setEditRoomLoading] = useState(false);

  const loadData = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [roomsData, kpiData, historyData] = await Promise.all([
        roomService.listRooms(businessId),
        roomService.getRoomDashboardKPIs(businessId),
        roomService.listBookingHistory(businessId),
      ]);

      // STRICT RULE: Only occupied or reserved rooms have an active booking.
      // Available, cleaning, or maintenance rooms NEVER show an old client name!
      const detailedRooms = roomsData.map((room) => {
        const isOccupiedOrReserved = room.status === "occupied" || room.status === "reserved";
        const currentActiveBooking = isOccupiedOrReserved
          ? historyData.find(
              (booking) =>
                booking.room_id === room.id &&
                (booking.status === "checked_in" || booking.status === "reserved")
            ) || null
          : null;

        return {
          ...room,
          active_booking: currentActiveBooking,
        };
      });

      setRooms(detailedRooms);
      setBookingHistory(historyData);
      setKpis(kpiData);

      if (selectedBooking) {
        const updated = historyData.find((b) => b.id === selectedBooking.id);
        if (updated) setSelectedBooking(updated);
      }
    } catch (err: any) {
      showToast("error", err.message || "Failed to load rooms data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [businessId]);

  // Unique floors
  const floors = useMemo(() => {
    return Array.from(
      new Set(
        rooms
          .map((r) => r.floor)
          .filter((f): f is string => Boolean(f && typeof f === "string" && f.trim().length > 0))
      )
    );
  }, [rooms]);

  // Available rooms for guest check-in dropdown
  const availableRooms = useMemo(() => {
    return rooms.filter((r) => r.status === "available");
  }, [rooms]);

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      const matchFloor = floorFilter === "all" || r.floor === floorFilter;
      const q = roomSearchQuery.toLowerCase();
      const matchSearch =
        !q ||
        r.room_number.toLowerCase().includes(q) ||
        r.room_type.toLowerCase().includes(q) ||
        (r.active_booking &&
          (r.active_booking as any).guest_name?.toLowerCase().includes(q));
      return matchStatus && matchFloor && matchSearch;
    });
  }, [rooms, statusFilter, floorFilter, roomSearchQuery]);

  // Filtered booking history for the system table
  const filteredBookings = useMemo(() => {
    return bookingHistory.filter((b) => {
      const matchStatus =
        historyStatus === "all"
          ? true
          : historyStatus === "active"
          ? b.status === "checked_in" || b.status === "reserved"
          : b.status === historyStatus;
      const q = historySearch.toLowerCase();
      const matchQ =
        !q ||
        b.guest_name.toLowerCase().includes(q) ||
        (b.guest_phone && b.guest_phone.toLowerCase().includes(q)) ||
        (b.room?.room_number && b.room.room_number.toLowerCase().includes(q));
      return matchStatus && matchQ;
    });
  }, [bookingHistory, historyStatus, historySearch]);

  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / historyPerPage));
  const paginatedBookings = useMemo(() => {
    const start = (historyPage - 1) * historyPerPage;
    return filteredBookings.slice(start, start + historyPerPage);
  }, [filteredBookings, historyPage, historyPerPage]);

  // Open Check-In
  const openCheckIn = (room?: RoomRecord) => {
    const targetRoom = room || availableRooms[0] || null;
    setSelectedRoom(targetRoom);
    setCheckInForm({
      ...defaultForm,
      room_rate: targetRoom ? targetRoom.price_per_night : 0,
    });
    setShowCheckInModal(true);
  };

  const handleCheckIn = async () => {
    if (checkInLoading) return; // Prevent double submit

    if (!selectedRoom || !checkInForm.guest_name.trim()) {
      showToast("error", "Please select an available room and enter the guest full name.");
      return;
    }
    if (selectedRoom.status !== "available") {
      showToast("error", `Room ${selectedRoom.room_number} is currently ${selectedRoom.status}. Only available rooms can be checked into.`);
      return;
    }

    // Double check: ensure no active booking already occupies this room in state
    const alreadyOccupied = rooms.some(
      (r) => r.id === selectedRoom.id && (r.status === "occupied" || r.status === "reserved")
    );
    if (alreadyOccupied) {
      showToast("error", `Room ${selectedRoom.room_number} is already occupied. Duplication prevented.`);
      return;
    }

    // Phone Number validation
    const cleanPhoneDigits = checkInForm.guest_phone.replace(/\D/g, "");
    if (!cleanPhoneDigits) {
      showToast("error", "Please provide a valid guest phone number.");
      return;
    }
    if (checkInForm.guest_phone_country_code === "+250" && cleanPhoneDigits.length !== 9 && cleanPhoneDigits.length !== 10) {
      showToast("error", "Rwanda phone number should be 9 digits (e.g. 788123456) or 10 digits with leading 0.");
      return;
    }
    const fullPhoneNumber = `${checkInForm.guest_phone_country_code}${cleanPhoneDigits.startsWith("0") ? cleanPhoneDigits.substring(1) : cleanPhoneDigits}`;

    // ID / Passport validation
    const idDoc = checkInForm.guest_id_passport.trim();
    if (!idDoc) {
      showToast("error", "Guest ID or Passport number is required by hospitality regulations.");
      return;
    }

    if (checkInForm.id_document_type === "rwanda_id") {
      const idDigits = idDoc.replace(/\D/g, "");
      if (idDigits.length !== 16) {
        showToast("error", `National ID (Rwanda) must be exactly 16 digits. You entered ${idDigits.length} digits.`);
        return;
      }
    } else {
      // Passport validation: standard international passport is 6-12 alphanumeric characters
      const cleanPassport = idDoc.replace(/\s+/g, "");
      if (cleanPassport.length < 6 || cleanPassport.length > 12) {
        showToast("error", `Passport number should be between 6 and 12 alphanumeric characters (entered ${cleanPassport.length}).`);
        return;
      }
    }

    // Expected checkout date validation: strictly today or future date (at least 1 night)
    const todayStr = getTodayDateString();
    if (!checkInForm.expected_checkout) {
      showToast("error", "Please select an expected check-out date.");
      return;
    }
    if (checkInForm.expected_checkout <= todayStr) {
      showToast("error", "Check-out date cannot be today or in the past. It must be at least 1 night in the future.");
      return;
    }

    // Rate validation
    if (checkInForm.room_rate <= 0) {
      showToast("error", "Nightly room rate must be greater than 0.");
      return;
    }

    // Additional Guests validation if 2 or more occupants
    const additionalGuestsList = (checkInForm.additional_guests || []).slice(0, Math.max(0, checkInForm.number_of_guests - 1));
    for (let i = 0; i < additionalGuestsList.length; i++) {
      const g = additionalGuestsList[i];
      const gNum = i + 2;
      if (!g.name || !g.name.trim()) {
        showToast("error", `Please provide the full legal name for Guest ${gNum}.`);
        return;
      }
      const gDoc = (g.id_passport || "").trim();
      if (!gDoc) {
        showToast("error", `ID or Passport document is required for Guest ${gNum} (${g.name}).`);
        return;
      }
      if (g.id_document_type === "rwanda_id") {
        const idDigits = gDoc.replace(/\D/g, "");
        if (idDigits.length !== 16) {
          showToast("error", `National ID for Guest ${gNum} (${g.name}) must be 16 digits (entered ${idDigits.length}).`);
          return;
        }
      } else {
        const cleanPassport = gDoc.replace(/\s+/g, "");
        if (cleanPassport.length < 6 || cleanPassport.length > 12) {
          showToast("error", `Passport for Guest ${gNum} (${g.name}) must be between 6 and 12 characters.`);
          return;
        }
      }
    }

    // Compose formatted notes with all registered occupants
    let finalNotes = checkInForm.notes ? checkInForm.notes.trim() : "";
    if (additionalGuestsList.length > 0) {
      const extraGuestsStr = additionalGuestsList
        .map(
          (g, idx) =>
            `• Guest ${idx + 2}: ${g.name.trim()} (${g.nationality}) | ${g.id_document_type === "rwanda_id" ? "NID" : "Passport"}: ${g.id_passport.trim()}${g.phone ? ` | Phone: ${g.phone_country_code}${g.phone}` : ""}`
        )
        .join("\n");
      finalNotes = finalNotes ? `${finalNotes}\n\nAdditional Registered Occupants:\n${extraGuestsStr}` : `Additional Registered Occupants:\n${extraGuestsStr}`;
    }

    setCheckInLoading(true);
    try {
      await roomService.checkInGuest({
        business_id: businessId,
        room_id: selectedRoom.id,
        guest_name: checkInForm.guest_name.trim(),
        guest_phone: fullPhoneNumber,
        guest_nationality: checkInForm.guest_nationality,
        guest_id_passport: `${checkInForm.id_document_type === "rwanda_id" ? "NID: " : "Passport: "}${idDoc}`,
        number_of_guests: checkInForm.number_of_guests,
        expected_checkout: new Date(checkInForm.expected_checkout).toISOString(),
        room_rate: checkInForm.room_rate,
        advance_paid: checkInForm.advance_paid,
        notes: finalNotes || undefined,
        created_by: profile?.id,
      });
      showToast(
        "success",
        `${checkInForm.guest_name} checked into Room ${selectedRoom.room_number}`
      );
      setShowCheckInModal(false);
      setCheckInForm(defaultForm);
      loadData();
    } catch (err: any) {
      showToast("error", err.message || "Check-in failed");
    } finally {
      setCheckInLoading(false);
    }
  };

  // Record payment in tab (Cannot exceed consumed balance)
  const openRecordPayment = (booking: RoomBookingRecord) => {
    setSelectedBooking(booking);
    setPaymentAmount(booking.balance_remaining || 0);
    setShowPaymentModal(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedBooking) return;
    const remainingBalance = Number(selectedBooking.balance_remaining || 0);

    if (paymentAmount <= 0) {
      showToast("error", "Please enter a valid payment amount greater than 0.");
      return;
    }

    // STRICT RULE: Payment cannot exceed the consumed balance!
    if (paymentAmount > remainingBalance) {
      showToast(
        "error",
        `Payment amount (${formatCurrency(paymentAmount)}) cannot exceed the consumed folio balance of ${formatCurrency(remainingBalance)}.`
      );
      return;
    }

    setPaymentLoading(true);
    try {
      await roomService.recordPayment(
        selectedBooking.id,
        paymentAmount,
        paymentMethod,
        profile?.id
      );
      showToast("success", `Payment of ${formatCurrency(paymentAmount)} recorded.`);
      setShowPaymentModal(false);
      loadData();
    } catch (err: any) {
      showToast("error", err.message || "Failed to record payment");
    } finally {
      setPaymentLoading(false);
    }
  };

  // Checkout flow: Strict rule - room cannot be cleared without full payment, and payment cannot exceed consumed
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
    const remainingBalance = Number((selectedBooking as any).balance_remaining || 0);

    if (remainingBalance > 0 && finalPayment < remainingBalance) {
      showToast(
        "error",
        `Full settlement of ${formatCurrency(remainingBalance)} is required to generate the complete financial report before releasing Room ${selectedRoom.room_number}.`
      );
      return;
    }

    if (finalPayment > remainingBalance) {
      showToast(
        "error",
        `Settlement amount (${formatCurrency(finalPayment)}) cannot exceed the consumed balance of ${formatCurrency(remainingBalance)}.`
      );
      return;
    }

    const confirmed = await confirm(
      "Confirm Guest Checkout & Full Settlement",
      `Checkout ${selectedBooking.guest_name} from Room ${selectedRoom.room_number}? Payment of ${formatCurrency(finalPayment)} will be reconciled and the room will move to Cleaning.`
    );
    if (!confirmed) return;

    setCheckoutLoading(true);
    try {
      await roomService.checkoutBooking(
        selectedBooking.id,
        selectedRoom.id,
        finalPayment,
        checkoutPaymentMethod,
        profile?.id
      );
      showToast(
        "success",
        `${selectedBooking.guest_name} settled & checked out. Room ${selectedRoom.room_number} moved to Cleaning.`
      );
      setShowCheckoutModal(false);
      loadData();
    } catch (err: any) {
      showToast("error", err.message || "Checkout failed");
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Strict room status rules: Room cannot become available if booked/occupied without full payment
  const handleStatusChange = async (room: RoomRecord, newStatus: RoomStatus) => {
    const booking = room.active_booking as any;
    if (newStatus === "available" && room.status !== "available") {
      const remainingBalance = Number(booking?.balance_remaining || 0);
      if (booking && remainingBalance > 0) {
        showToast(
          "error",
          `Payment Required: Room ${room.room_number} cannot be made Available. Guest ${booking.guest_name} has an open balance of ${formatCurrency(remainingBalance)}. Settle the folio first to generate accurate financial reports.`
        );
        return;
      }

      // If guest has paid in full (balance <= 0) and is still marked checked_in, complete checkout cleanly
      if (booking && booking.status === "checked_in") {
        try {
          await roomService.checkoutBooking(booking.id, room.id, 0, "cash", profile?.id);
        } catch (checkoutErr: any) {
          console.warn("Auto-checkout during status transition:", checkoutErr);
        }
      }
    }

    try {
      await roomService.updateRoomStatus(room.id, newStatus);
      showToast("success", `Room ${room.room_number} set to ${newStatus}`);
      loadData();
    } catch (err: any) {
      showToast("error", err.message || "Status update failed");
    }
  };

  // Edit Room
  const openEditRoom = (room: RoomRecord) => {
    setEditingRoom(room);
    setEditRoomForm({
      room_number: room.room_number,
      room_type: room.room_type,
      price_per_night: room.price_per_night,
      capacity: room.capacity || 2,
      floor: room.floor || "Floor 1",
    });
    setShowEditRoomModal(true);
  };

  const handleUpdateRoom = async () => {
    if (!editingRoom) return;
    if (!editRoomForm.room_number || !editRoomForm.room_type || editRoomForm.price_per_night <= 0) {
      showToast("error", "Please provide room number, category, and nightly rate");
      return;
    }
    setEditRoomLoading(true);
    try {
      await roomService.updateRoom(editingRoom.id, {
        room_number: editRoomForm.room_number,
        room_type: editRoomForm.room_type,
        price_per_night: editRoomForm.price_per_night,
        capacity: editRoomForm.capacity,
        floor: editRoomForm.floor,
      });
      showToast("success", `Room ${editRoomForm.room_number} updated.`);
      setShowEditRoomModal(false);
      setEditingRoom(null);
      loadData();
    } catch (err: any) {
      showToast("error", err.message || "Failed to update room");
    } finally {
      setEditRoomLoading(false);
    }
  };

  // Delete Room
  const handleDeleteRoom = async (room: RoomRecord) => {
    if (room.status === "occupied") {
      showToast("error", `Cannot delete Room ${room.room_number} while occupied by a guest.`);
      return;
    }

    const ok = await confirm(
      "Delete Property Room",
      `Are you sure you want to permanently delete Room "${room.room_number}"?`
    );
    if (!ok) return;

    try {
      await roomService.deleteRoom(room.id);
      showToast("success", `Room ${room.room_number} deleted.`);
      loadData();
    } catch (err: any) {
      showToast("error", err.message || "Could not delete room linked to previous bookings.");
    }
  };

  const handleAddRoom = async () => {
    if (!newRoom.room_number || !newRoom.room_type || newRoom.price_per_night <= 0) {
      showToast("error", "Please provide room number, category, and nightly rate");
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
      showToast("success", `Room ${newRoom.room_number} added to inventory.`);
      setShowAddRoomModal(false);
      setNewRoom({
        room_number: "",
        room_type: "Standard",
        price_per_night: 0,
        capacity: 2,
        floor: "Floor 1",
      });
      loadData();
    } catch (err: any) {
      showToast("error", err.message || "Failed to add room");
    } finally {
      setAddRoomLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink tracking-tight sm:text-3xl">
            Hospitality & Rooms
          </h1>
          <p className="text-xs font-medium text-slate-500 mt-0.5">
            Real-time occupancy, guest registrations, payment records, and financial reconciliation.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-soft hover:bg-slate-50 transition"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => openCheckIn()}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-soft hover:bg-emerald-700 transition active:scale-95"
          >
            <UserCheck size={14} />
            <span>Check In Client</span>
          </button>
          <button
            onClick={() => setShowAddRoomModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-black text-white shadow-soft hover:bg-brand-700 transition active:scale-95"
          >
            <Plus size={14} />
            <span>Add Room</span>
          </button>
        </div>
      </div>

      {/* Section: Organised, Well-Proportioned Room Grid */}
      <SectionCard
        title="Rooms & Floor Plan"
        subtitle="Manage availability, view balances, record payments, and enforce settlement before checkout"
      >
        {/* Filter Toolbar */}
        <div className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center gap-2 rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-3.5 py-2.5 text-xs">
            <Search size={14} className="text-brand-500 shrink-0" />
            <input
              value={roomSearchQuery}
              onChange={(e) => setRoomSearchQuery(e.target.value)}
              className="w-full border-none bg-transparent font-semibold outline-none text-slate-800 placeholder-slate-400 text-xs"
              placeholder="Search room number, type, or guest..."
            />
          </label>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-sky-100 bg-sky-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 outline-none"
          >
            <option value="all">All Statuses ({rooms.length})</option>
            <option value="available">Available ({kpis.availableRooms})</option>
            <option value="occupied">Occupied ({kpis.occupiedRooms})</option>
            <option value="cleaning">Cleaning ({kpis.cleaningRooms})</option>
            <option value="reserved">Reserved ({kpis.reservedRooms})</option>
          </select>

          <select
            value={floorFilter}
            onChange={(e) => setFloorFilter(e.target.value)}
            className="rounded-xl border border-violet-100 bg-violet-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 outline-none"
          >
            <option value="all">All Floors & Wings</option>
            {floors.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <div className="flex items-center justify-end text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {filteredRooms.length} of {rooms.length} Rooms
          </div>
        </div>

        {/* Room Cards Grid: Clean sizing and organized structure */}
        {loading ? (
          <div className="flex justify-center py-16 text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-brand-100 border-t-brand-600" />
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
            <Hotel size={36} className="mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">No rooms match filter criteria</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredRooms.map((room) => {
              const cfg = STATUS_CONFIG[room.status] || STATUS_CONFIG.available;
              const isOccupiedOrReserved = (room.status === "occupied" || room.status === "reserved") && (room.active_booking as any)?.status === "checked_in";
              const booking = isOccupiedOrReserved ? (room.active_booking as any) : null;
              const balance = booking ? Number(booking.balance_remaining || 0) : 0;

              return (
                <div
                  key={room.id}
                  className={`group flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-sm transition-all hover:shadow-md ${cfg.cardBorder}`}
                >
                  <div>
                    {/* Top Row: Room Number & Status Badge */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Hotel size={16} className="text-brand-600 shrink-0" />
                        <span className="text-base font-black text-slate-900 tracking-tight truncate">
                          Room {room.room_number}
                        </span>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider border shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </div>

                    {/* Room Category & Floor */}
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                      <span className="font-semibold text-slate-700 truncate">{room.room_type}</span>
                      <span className="text-slate-400 text-[11px] shrink-0">{room.floor || "Floor 1"}</span>
                    </div>

                    {/* Nightly Rate */}
                    <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-slate-100">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Rate</span>
                      <span className="text-sm font-black text-brand-600">
                        {formatCurrency(room.price_per_night)}
                        <span className="text-[10px] font-medium text-slate-400"> / nt</span>
                      </span>
                    </div>

                    {/* Guest Stay Card: ONLY DISPLAYED IF ACTIVELY OCCUPIED OR RESERVED */}
                    {isOccupiedOrReserved && booking ? (
                      <div className="mb-3 rounded-xl bg-rose-50/60 border border-rose-200 p-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between font-black text-slate-900">
                          <span className="truncate flex items-center gap-1">
                            <User size={12} className="text-slate-400" />
                            {booking.guest_name}
                          </span>
                          <span className={balance > 0 ? "text-rose-600 font-black" : "text-emerald-600 font-bold"}>
                            {balance > 0 ? formatCurrency(balance) : "Settled"}
                          </span>
                        </div>
                        {booking.expected_checkout && (
                          <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                            <Clock size={10} />
                            <span>Out: {new Date(booking.expected_checkout).toLocaleDateString()}</span>
                          </p>
                        )}
                      </div>
                    ) : (
                      /* Clean state for Available, Cleaning, Maintenance */
                      <div className="mb-3 rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-center text-xs text-slate-400 font-medium">
                        {room.status === "available" ? "Ready for Guest Check-In" : `Condition: ${cfg.label}`}
                      </div>
                    )}
                  </div>

                  {/* Actions inside the card: Clearly visible, well-spaced */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    {/* Primary Button by Status */}
                    {room.status === "available" && (
                      <button
                        onClick={() => openCheckIn(room)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-xs font-black text-white hover:bg-brand-700 transition shadow-xs active:scale-95"
                      >
                        <UserCheck size={14} />
                        <span>Check In Guest</span>
                      </button>
                    )}

                    {room.status === "occupied" && (
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          onClick={() => booking && openRecordPayment(booking)}
                          className="flex items-center justify-center gap-1 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs"
                          title="Record Payment"
                        >
                          <Wallet size={12} />
                          <span>Pay</span>
                        </button>
                        <button
                          onClick={() => {
                            if (booking) {
                              setSelectedBooking(booking);
                              setShowFolioModal(true);
                            }
                          }}
                          className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
                          title="View Folio Statement"
                        >
                          <FileText size={12} className="text-brand-600" />
                          <span>Folio</span>
                        </button>
                        <button
                          onClick={() => openCheckout(room)}
                          className={`flex items-center justify-center gap-1 rounded-xl py-2 text-xs font-bold text-white transition shadow-xs ${
                            balance > 0 ? "bg-rose-400" : "bg-rose-600 hover:bg-rose-700"
                          }`}
                          title={balance > 0 ? "Settle balance before checkout" : "Check Out"}
                        >
                          <LogOut size={12} />
                          <span>Out</span>
                        </button>
                      </div>
                    )}

                    {room.status === "cleaning" && (
                      <button
                        onClick={() => handleStatusChange(room, "available")}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white hover:bg-emerald-700 transition shadow-xs"
                      >
                        <CheckCircle2 size={14} />
                        <span>Mark Ready</span>
                      </button>
                    )}

                    {room.status === "maintenance" && (
                      <button
                        onClick={() => handleStatusChange(room, "available")}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-800 py-2.5 text-xs font-black text-white hover:bg-slate-900 transition shadow-xs"
                      >
                        <CheckCircle2 size={14} />
                        <span>Mark Available</span>
                      </button>
                    )}

                    {/* Secondary Row: Status Selector, QR Code, Edit, Delete */}
                    <div className="flex items-center gap-1.5">
                      <select
                        value={room.status}
                        onChange={(e) => handleStatusChange(room, e.target.value as RoomStatus)}
                        className="flex-1 min-w-0 rounded-xl bg-slate-50 border border-slate-200 py-1.5 px-2 text-[11px] font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 transition"
                      >
                        <option value="available">Status: Available</option>
                        <option value="reserved">Status: Reserved</option>
                        <option value="cleaning">Status: Cleaning</option>
                        <option value="maintenance">Status: Maintenance</option>
                        {room.status === "occupied" && <option value="occupied">Status: Occupied</option>}
                      </select>

                      <button
                        onClick={() => setQrTargetRoom(room)}
                        title="Room QR Menu"
                        className="rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-indigo-700 hover:bg-indigo-100 transition shrink-0"
                      >
                        <QrCode size={13} />
                      </button>
                      <button
                        onClick={() => openEditRoom(room)}
                        title="Edit Room"
                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-50 transition shrink-0"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteRoom(room)}
                        title="Delete Room"
                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition shrink-0"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Section: Guest Stay & Folio Ledger Table (Using Icon Action Buttons) */}
      <SectionCard
        title="Guest Stay & Folio Ledger"
        subtitle="Complete ledger of guest stays. Click any row or action icon to view statements and record payments"
      >
        {/* Table Filters Bar */}
        <div className="mb-4 grid gap-2.5 sm:grid-cols-3">
          <label className="flex items-center gap-2 rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-3.5 py-2.5 text-xs">
            <Search size={14} className="text-brand-500 shrink-0" />
            <input
              value={historySearch}
              onChange={(e) => {
                setHistorySearch(e.target.value);
                setHistoryPage(1);
              }}
              className="w-full border-none bg-transparent font-semibold outline-none text-slate-800 placeholder-slate-400 text-xs"
              placeholder="Search by guest name, phone, or room..."
            />
          </label>

          <select
            value={historyStatus}
            onChange={(e) => {
              setHistoryStatus(e.target.value);
              setHistoryPage(1);
            }}
            className="rounded-xl border border-sky-100 bg-sky-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 outline-none"
          >
            <option value="all">All Booking Records ({bookingHistory.length})</option>
            <option value="active">Active Stays (Checked In / Reserved)</option>
            <option value="checked_out">Checked Out (Completed)</option>
            <option value="reserved">Reserved (Upcoming)</option>
          </select>

          <div className="flex items-center justify-end text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Page {historyPage} of {totalPages} ({filteredBookings.length} total)
          </div>
        </div>

        {/* Polished Corporate Table with Icon Actions */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-xs">
              <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                <tr>
                  {[
                    "Guest & Room",
                    "Stay Dates",
                    "Room Rate",
                    "Bar & Kitchen",
                    "Total Paid",
                    "Balance Due",
                    "Status",
                    "Actions",
                  ].map((col) => (
                    <th
                      key={col}
                      className="border-b border-white/10 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-100"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-slate-100">
                {paginatedBookings.length > 0 ? (
                  paginatedBookings.map((booking) => {
                    const foodAndBar = (booking.charges || [])
                      .filter((c: any) => c.service_type === "bar" || c.service_type === "food")
                      .reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);
                    const paid =
                      Number(booking.advance_paid || 0) + Number(booking.total_payments || 0);
                    const isOpen =
                      booking.status === "checked_in" || booking.status === "reserved";
                    const balance = Number(booking.balance_remaining || 0);

                    return (
                      <tr
                        key={booking.id}
                        onClick={() => {
                          setSelectedBooking(booking);
                          setShowFolioModal(true);
                        }}
                        className="cursor-pointer hover:bg-brand-50/60 transition-colors group"
                        title="Click to view full guest details and folio statement"
                      >
                        {/* Guest & Room */}
                        <td className="px-4 py-2.5 border-b border-slate-100">
                          <p className="font-bold text-slate-900 group-hover:text-brand-600 transition leading-tight">
                            {booking.guest_name}
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium">
                            Room {booking.room?.room_number || "—"} ({booking.room?.room_type || "Standard"}) ·{" "}
                            {booking.guest_phone || "No phone"}
                          </p>
                        </td>

                        {/* Stay Dates */}
                        <td className="px-4 py-2.5 border-b border-slate-100 text-[11px] text-slate-600">
                          <p className="font-semibold text-slate-800 leading-tight">
                            In: {new Date(booking.check_in).toLocaleDateString()}
                          </p>
                          <p className="text-slate-400 text-[10px]">
                            Out:{" "}
                            {booking.check_out
                              ? new Date(booking.check_out).toLocaleDateString()
                              : booking.expected_checkout
                              ? `Exp: ${new Date(booking.expected_checkout).toLocaleDateString()}`
                              : "Active stay"}
                          </p>
                        </td>

                        {/* Room Rate */}
                        <td className="px-4 py-2.5 border-b border-slate-100 text-slate-800 font-bold">
                          {formatCurrency(booking.room_rate)}
                        </td>

                        {/* Bar & Kitchen Extras */}
                        <td className="px-4 py-2.5 border-b border-slate-100 font-bold text-brand-600">
                          {formatCurrency(foodAndBar)}
                        </td>

                        {/* Total Paid */}
                        <td className="px-4 py-2.5 border-b border-slate-100 font-bold text-emerald-700">
                          {formatCurrency(paid)}
                        </td>

                        {/* Balance Due */}
                        <td className="px-4 py-2.5 border-b border-slate-100">
                          <span
                            className={`text-xs font-black ${
                              balance > 0 ? "text-rose-600" : "text-emerald-600"
                            }`}
                          >
                            {formatCurrency(balance)}
                          </span>
                        </td>

                        {/* Status Badge */}
                        <td className="px-4 py-2.5 border-b border-slate-100">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                              isOpen
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : booking.status === "checked_out"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isOpen
                                  ? "bg-blue-500"
                                  : booking.status === "checked_out"
                                  ? "bg-emerald-500"
                                  : "bg-slate-400"
                              }`}
                            />
                            {booking.status.replace("_", " ")}
                          </span>
                        </td>

                        {/* Action Icon Buttons */}
                        <td className="px-4 py-2.5 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            {/* 1. Payment Icon Button */}
                            {isOpen && balance > 0 ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRecordPayment(booking);
                                }}
                                className="flex h-8 items-center gap-1 px-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-xs active:scale-95 text-[11px] font-bold"
                                title="Record Folio Payment in Tab"
                              >
                                <Wallet size={13} />
                                <span>Pay</span>
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedBooking(booking);
                                  setShowFolioModal(true);
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 transition shadow-2xs cursor-pointer"
                                title="Folio is Settled (Click to view statement)"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            )}

                            {/* 2. Folio Statement Icon Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBooking(booking);
                                setShowFolioModal(true);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-brand-600 hover:bg-brand-50 hover:border-brand-300 transition shadow-2xs active:scale-95"
                              title="View Folio Statement & Invoices"
                            >
                              <FileText size={14} />
                            </button>

                            {/* 3. Print Icon Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBooking(booking);
                                setShowFolioModal(true);
                                setTimeout(() => window.print(), 200);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition shadow-2xs active:scale-95"
                              title="Print Guest Folio"
                            >
                              <Printer size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      <FileText size={32} className="mx-auto mb-1 text-slate-300" />
                      <p className="font-bold text-slate-700 text-xs">No guest records found</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs">
              <span className="text-[11px] font-bold text-slate-500">
                Showing {paginatedBookings.length} of {filteredBookings.length} records
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyPage === 1}
                  className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-bold text-slate-800">
                  {historyPage} / {totalPages}
                </span>
                <button
                  onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
                  disabled={historyPage === totalPages}
                  className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition disabled:opacity-40"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ========== CHECK-IN CLIENT MODAL (AVAILABLE ROOMS ONLY) ========== */}
      {showCheckInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl my-8 border border-slate-100">
            <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-ink">Check In Client</h2>
                <p className="text-xs text-slate-500 font-medium">Select an available room and register guest details.</p>
              </div>
              <button
                onClick={() => setShowCheckInModal(false)}
                className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Select Room (Available Rooms Only) *
                </label>
                {availableRooms.length === 0 ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-amber-800 font-medium">
                    ⚠️ No rooms are currently available. All rooms are occupied, reserved, or in cleaning.
                  </div>
                ) : (
                  <select
                    value={selectedRoom?.id || ""}
                    onChange={(e) => {
                      const found = availableRooms.find((r) => r.id === e.target.value) || null;
                      setSelectedRoom(found);
                      if (found) {
                        setCheckInForm((prev) => ({ ...prev, room_rate: found.price_per_night }));
                      }
                    }}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-brand-500"
                  >
                    <option value="">-- Choose an Available Room --</option>
                    {availableRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.room_number} ({r.room_type} • {r.floor || "Floor 1"} • {formatCurrency(r.price_per_night)}/night)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Guest Full Name *</label>
                <input
                  type="text"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-sm font-bold outline-none focus:border-brand-500 focus:bg-white text-slate-900"
                  placeholder="e.g. Jean Paul Habimana"
                  value={checkInForm.guest_name}
                  onChange={(e) => setCheckInForm({ ...checkInForm, guest_name: e.target.value })}
                  autoFocus
                />
              </div>

              {/* Guest Phone with Country Code Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phone Number * (Select Country Code)
                </label>
                <div className="flex gap-2">
                  <select
                    value={checkInForm.guest_phone_country_code}
                    onChange={(e) => {
                      const selected = COUNTRY_CODES.find((c) => c.code === e.target.value);
                      setCheckInForm({
                        ...checkInForm,
                        guest_phone_country_code: e.target.value,
                        guest_nationality: selected ? selected.nationality : checkInForm.guest_nationality,
                      });
                    }}
                    className="w-44 shrink-0 rounded-xl bg-slate-50 border border-slate-200 p-2 text-xs font-bold text-slate-900 outline-none focus:border-brand-500"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-bold outline-none focus:border-brand-500 focus:bg-white text-slate-900 tracking-wide"
                    placeholder={checkInForm.guest_phone_country_code === "+250" ? "788 123 456" : "Phone number"}
                    value={checkInForm.guest_phone}
                    onChange={(e) => setCheckInForm({ ...checkInForm, guest_phone: e.target.value })}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {checkInForm.guest_phone_country_code === "+250"
                    ? "Rwanda: Enter 9 digits (e.g. 788123456) or 10 digits with initial 0."
                    : `Country dial code: ${checkInForm.guest_phone_country_code}`}
                </p>
              </div>

              {/* Nationality & Number of Guests */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nationality *</label>
                  <input
                    type="text"
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-semibold outline-none focus:border-brand-500 focus:bg-white text-slate-900"
                    value={checkInForm.guest_nationality}
                    onChange={(e) => setCheckInForm({ ...checkInForm, guest_nationality: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Number of Guests</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-semibold outline-none focus:border-brand-500 focus:bg-white text-slate-900"
                    value={checkInForm.number_of_guests}
                    onChange={(e) => {
                      const count = Math.max(1, parseInt(e.target.value) || 1);
                      const needed = count - 1;
                      const current = [...(checkInForm.additional_guests || [])];
                      while (current.length < needed) {
                        current.push({
                          name: "",
                          phone_country_code: "+250",
                          phone: "",
                          nationality: "Rwandan",
                          id_document_type: "rwanda_id",
                          id_passport: "",
                        });
                      }
                      setCheckInForm({
                        ...checkInForm,
                        number_of_guests: count,
                        additional_guests: current.slice(0, needed),
                      });
                    }}
                  />
                </div>
              </div>

              {/* ID Document: Rwanda ID (16 Digits) vs Passport (6-12 chars) */}
              <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-slate-800">
                    Guest 1 (Primary) Identification Document *
                  </label>
                  <div className="flex items-center gap-2 bg-white rounded-lg p-0.5 border border-slate-200 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() =>
                        setCheckInForm({
                          ...checkInForm,
                          id_document_type: "rwanda_id",
                          guest_nationality: "Rwandan",
                          guest_phone_country_code: "+250",
                        })
                      }
                      className={`px-2.5 py-1 rounded-md transition ${
                        checkInForm.id_document_type === "rwanda_id"
                          ? "bg-brand-600 text-white shadow-xs font-black"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      🇷🇼 Rwanda NID (16 Digits)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckInForm({ ...checkInForm, id_document_type: "passport" })}
                      className={`px-2.5 py-1 rounded-md transition ${
                        checkInForm.id_document_type === "passport"
                          ? "bg-brand-600 text-white shadow-xs font-black"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      🌍 Passport
                    </button>
                  </div>
                </div>

                {checkInForm.id_document_type === "rwanda_id" ? (
                  <div>
                    <input
                      type="text"
                      maxLength={16}
                      className="w-full rounded-xl bg-white border border-slate-300 p-2.5 text-xs font-mono font-bold tracking-widest text-slate-900 outline-none focus:border-brand-500"
                      placeholder="1 1990 8 0012345 0 12 (16 digits)"
                      value={checkInForm.guest_id_passport}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 16);
                        setCheckInForm({ ...checkInForm, guest_id_passport: digits });
                      }}
                    />
                    <div className="flex justify-between text-[10px] mt-1 font-semibold">
                      <span className={checkInForm.guest_id_passport.length === 16 ? "text-emerald-600 font-bold" : "text-slate-500"}>
                        {checkInForm.guest_id_passport.length === 16 ? "✓ Valid 16-digit Rwanda ID" : "National ID format: 16 numeric digits"}
                      </span>
                      <span className={checkInForm.guest_id_passport.length === 16 ? "text-emerald-600 font-black" : "text-slate-400"}>
                        {checkInForm.guest_id_passport.length} / 16
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      maxLength={12}
                      className="w-full rounded-xl bg-white border border-slate-300 p-2.5 text-xs font-mono font-bold tracking-wider uppercase text-slate-900 outline-none focus:border-brand-500"
                      placeholder="Passport No (e.g. PC1234567)"
                      value={checkInForm.guest_id_passport}
                      onChange={(e) =>
                        setCheckInForm({ ...checkInForm, guest_id_passport: e.target.value.toUpperCase() })
                      }
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      International passport standard: 6 to 12 alphanumeric characters.
                    </p>
                  </div>
                )}
              </div>

              {/* Dynamic Additional Guests Registration Forms (Guests 2, 3, etc.) */}
              {checkInForm.number_of_guests > 1 && (
                <div className="space-y-3 pt-3 border-t-2 border-brand-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-brand-100 p-1 text-brand-700">
                        <Users size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                          Register Additional Occupants ({checkInForm.number_of_guests - 1} More)
                        </h4>
                        <p className="text-[10px] text-slate-500 font-medium">
                          All occupants must provide full name and official identification.
                        </p>
                      </div>
                    </div>
                  </div>

                  {(checkInForm.additional_guests || [])
                    .slice(0, checkInForm.number_of_guests - 1)
                    .map((guest, idx) => {
                      const gNum = idx + 2;
                      return (
                        <div
                          key={idx}
                          className="rounded-2xl border border-brand-200 bg-brand-50/40 p-3.5 space-y-3 shadow-2xs"
                        >
                          <div className="flex items-center justify-between border-b border-brand-200/60 pb-2">
                            <span className="text-xs font-black text-brand-900">
                              Guest #{gNum} Information
                            </span>
                            <span className="text-[10px] font-bold text-brand-700 bg-white border border-brand-200 rounded-full px-2.5 py-0.5">
                              Room Occupant #{gNum}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Full Legal Name *
                              </label>
                              <input
                                type="text"
                                placeholder={`Guest ${gNum} full name`}
                                className="w-full rounded-xl bg-white border border-slate-200 p-2 text-xs font-semibold outline-none focus:border-brand-500 text-slate-900"
                                value={guest.name}
                                onChange={(e) => {
                                  const updated = [...(checkInForm.additional_guests || [])];
                                  updated[idx] = { ...updated[idx], name: e.target.value };
                                  setCheckInForm({ ...checkInForm, additional_guests: updated });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Nationality *
                              </label>
                              <input
                                type="text"
                                className="w-full rounded-xl bg-white border border-slate-200 p-2 text-xs font-semibold outline-none focus:border-brand-500 text-slate-900"
                                value={guest.nationality}
                                onChange={(e) => {
                                  const updated = [...(checkInForm.additional_guests || [])];
                                  updated[idx] = { ...updated[idx], nationality: e.target.value };
                                  setCheckInForm({ ...checkInForm, additional_guests: updated });
                                }}
                              />
                            </div>
                          </div>

                          {/* ID Document Type & Field */}
                          <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] font-black text-slate-800">
                                Guest #{gNum} Identification *
                              </label>
                              <div className="flex items-center gap-1 text-[10px] font-bold bg-slate-50 p-0.5 rounded-lg border border-slate-200">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...(checkInForm.additional_guests || [])];
                                    updated[idx] = {
                                      ...updated[idx],
                                      id_document_type: "rwanda_id",
                                      nationality: "Rwandan",
                                      phone_country_code: "+250",
                                    };
                                    setCheckInForm({ ...checkInForm, additional_guests: updated });
                                  }}
                                  className={`px-2 py-0.5 rounded-md transition ${
                                    guest.id_document_type === "rwanda_id"
                                      ? "bg-brand-600 text-white font-black"
                                      : "text-slate-600"
                                  }`}
                                >
                                  🇷🇼 NID (16 Digits)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...(checkInForm.additional_guests || [])];
                                    updated[idx] = { ...updated[idx], id_document_type: "passport" };
                                    setCheckInForm({ ...checkInForm, additional_guests: updated });
                                  }}
                                  className={`px-2 py-0.5 rounded-md transition ${
                                    guest.id_document_type === "passport"
                                      ? "bg-brand-600 text-white font-black"
                                      : "text-slate-600"
                                  }`}
                                >
                                  🌍 Passport
                                </button>
                              </div>
                            </div>

                            {guest.id_document_type === "rwanda_id" ? (
                              <div>
                                <input
                                  type="text"
                                  maxLength={16}
                                  placeholder="1 1990 8 0012345 0 12 (16 digits)"
                                  className="w-full rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs font-mono font-bold tracking-widest text-slate-900 outline-none focus:border-brand-500 focus:bg-white"
                                  value={guest.id_passport}
                                  onChange={(e) => {
                                    const digits = e.target.value.replace(/\D/g, "").slice(0, 16);
                                    const updated = [...(checkInForm.additional_guests || [])];
                                    updated[idx] = { ...updated[idx], id_passport: digits };
                                    setCheckInForm({ ...checkInForm, additional_guests: updated });
                                  }}
                                />
                                <div className="flex justify-between text-[10px] mt-1 font-semibold">
                                  <span className={guest.id_passport.length === 16 ? "text-emerald-600 font-bold" : "text-slate-500"}>
                                    {guest.id_passport.length === 16 ? "✓ Valid 16-digit Rwanda ID" : "16 numeric digits"}
                                  </span>
                                  <span className={guest.id_passport.length === 16 ? "text-emerald-600 font-black" : "text-slate-400"}>
                                    {guest.id_passport.length} / 16
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <input
                                  type="text"
                                  maxLength={12}
                                  placeholder="Passport No (e.g. PC1234567)"
                                  className="w-full rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs font-mono font-bold uppercase tracking-wider text-slate-900 outline-none focus:border-brand-500 focus:bg-white"
                                  value={guest.id_passport}
                                  onChange={(e) => {
                                    const updated = [...(checkInForm.additional_guests || [])];
                                    updated[idx] = { ...updated[idx], id_passport: e.target.value.toUpperCase() };
                                    setCheckInForm({ ...checkInForm, additional_guests: updated });
                                  }}
                                />
                                <p className="text-[10px] text-slate-400 mt-1">
                                  Standard passport: 6-12 characters
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Guest Phone (Optional) */}
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Phone Number (Optional)
                            </label>
                            <div className="flex gap-2">
                              <select
                                value={guest.phone_country_code}
                                onChange={(e) => {
                                  const updated = [...(checkInForm.additional_guests || [])];
                                  updated[idx] = { ...updated[idx], phone_country_code: e.target.value };
                                  setCheckInForm({ ...checkInForm, additional_guests: updated });
                                }}
                                className="w-36 shrink-0 rounded-xl bg-white border border-slate-200 p-2 text-xs font-bold text-slate-800 outline-none"
                              >
                                {COUNTRY_CODES.map((c) => (
                                  <option key={c.code} value={c.code}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="tel"
                                placeholder="Phone number"
                                className="w-full rounded-xl bg-white border border-slate-200 p-2 text-xs font-semibold outline-none focus:border-brand-500 text-slate-900"
                                value={guest.phone}
                                onChange={(e) => {
                                  const updated = [...(checkInForm.additional_guests || [])];
                                  updated[idx] = { ...updated[idx], phone: e.target.value.replace(/\D/g, "") };
                                  setCheckInForm({ ...checkInForm, additional_guests: updated });
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Expected Check-out Date (Restricted: strictly tomorrow or future, at least 1 night) */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Expected Check-Out * (Min 1 Night)
                  </label>
                  <input
                    type="date"
                    min={getTomorrowDateString()}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-bold outline-none focus:border-brand-500 focus:bg-white text-slate-900 cursor-pointer"
                    value={checkInForm.expected_checkout}
                    onChange={(e) => setCheckInForm({ ...checkInForm, expected_checkout: e.target.value })}
                  />
                  <p className="text-[9px] text-slate-400 mt-0.5">Past dates and today are disabled.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nightly Rate (RWF) *</label>
                  <input
                    type="number"
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-bold outline-none focus:border-brand-500 focus:bg-white text-slate-900"
                    value={checkInForm.room_rate}
                    onChange={(e) =>
                      setCheckInForm({ ...checkInForm, room_rate: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Advance Deposit (RWF)</label>
                <input
                  type="number"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-bold outline-none focus:border-brand-500 focus:bg-white text-slate-900"
                  placeholder="0"
                  value={checkInForm.advance_paid || ""}
                  onChange={(e) =>
                    setCheckInForm({ ...checkInForm, advance_paid: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Stay Notes / Special Requests</label>
                <textarea
                  rows={2}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-medium outline-none focus:border-brand-500 focus:bg-white text-slate-900 resize-none"
                  placeholder="Optional notes or guest requests..."
                  value={checkInForm.notes}
                  onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2.5 mt-5">
              <button
                onClick={() => setShowCheckInModal(false)}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCheckIn}
                disabled={checkInLoading || !checkInForm.guest_name || !selectedRoom}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-xs font-black text-white hover:bg-brand-700 transition disabled:opacity-50 shadow-soft"
              >
                {checkInLoading ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                <span>Confirm Check-In</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== RECORD PAYMENT MODAL ========== */}
      {showPaymentModal && selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-ink">Record Folio Payment</h2>
                <p className="text-xs text-slate-500 font-medium">Guest: {selectedBooking.guest_name}</p>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 rounded-xl bg-slate-50 border border-slate-200 p-3 flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-slate-500 block">Consumed Folio Balance:</span>
                <span className="text-[10px] text-slate-400">Maximum payable amount</span>
              </div>
              <span className="text-base font-black text-rose-600">
                {formatCurrency(selectedBooking.balance_remaining || 0)}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-slate-700">Payment Amount (RWF) *</label>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(selectedBooking.balance_remaining || 0)}
                    className="text-[11px] font-bold text-brand-600 hover:text-brand-700"
                  >
                    Pay Full Balance
                  </button>
                </div>
                <input
                  type="number"
                  min={1}
                  max={selectedBooking.balance_remaining || 0}
                  className={`w-full rounded-xl bg-slate-50 border p-2.5 text-lg font-black text-slate-900 outline-none focus:bg-white ${
                    paymentAmount > (selectedBooking.balance_remaining || 0)
                      ? "border-rose-500 text-rose-600 focus:border-rose-600"
                      : "border-slate-300 focus:border-brand-500"
                  }`}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  autoFocus
                />
                {paymentAmount > (selectedBooking.balance_remaining || 0) && (
                  <p className="text-[11px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={13} />
                    <span>Amount cannot exceed consumed balance of {formatCurrency(selectedBooking.balance_remaining || 0)}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-brand-500"
                >
                  <option value="cash">💵 Cash</option>
                  <option value="momo">📱 Mobile Money (MTN / Airtel)</option>
                  <option value="card">💳 Credit / Debit Card</option>
                  <option value="bank">🏦 Bank Transfer</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2.5 mt-5">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={
                  paymentLoading ||
                  paymentAmount <= 0 ||
                  paymentAmount > (selectedBooking.balance_remaining || 0)
                }
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white hover:bg-emerald-700 transition disabled:opacity-50 shadow-soft"
              >
                {paymentLoading ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                <span>Record Payment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== CHECKOUT MODAL (STRICT FULL SETTLEMENT RULE) ========== */}
      {showCheckoutModal && selectedRoom && selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-ink">Checkout & Full Settlement</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Room {selectedRoom.room_number} ({selectedRoom.room_type})
                </p>
              </div>
              <button
                onClick={() => setShowCheckoutModal(false)}
                className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 mb-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Guest:</span>
                <span className="font-bold text-slate-900">{selectedBooking.guest_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Room Rate:</span>
                <span className="font-bold text-slate-900">{formatCurrency(selectedBooking.room_rate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Advance Deposit Paid:</span>
                <span className="font-bold text-emerald-700">-{formatCurrency(selectedBooking.advance_paid)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-xs font-black">
                <span className="text-ink">Net Balance Required:</span>
                <span className="text-rose-600">
                  {formatCurrency((selectedBooking as any).balance_remaining || 0)}
                </span>
              </div>
            </div>

            <div className="mb-3">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-slate-700">Payment Received Now *</label>
                <button
                  type="button"
                  onClick={() => setFinalPayment((selectedBooking as any).balance_remaining || 0)}
                  className="text-[11px] font-bold text-brand-600 hover:text-brand-700"
                >
                  Exact Balance
                </button>
              </div>
              <input
                type="number"
                min={0}
                max={(selectedBooking as any).balance_remaining || 0}
                className={`w-full rounded-xl bg-slate-50 border p-2.5 text-lg font-black text-slate-900 outline-none focus:bg-white ${
                  finalPayment > ((selectedBooking as any).balance_remaining || 0)
                    ? "border-rose-500 text-rose-600 focus:border-rose-600"
                    : "border-slate-300 focus:border-brand-600"
                }`}
                value={finalPayment}
                onChange={(e) => setFinalPayment(parseFloat(e.target.value) || 0)}
              />
              {finalPayment > ((selectedBooking as any).balance_remaining || 0) ? (
                <p className="text-[11px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                  <AlertCircle size={13} />
                  <span>
                    Cannot exceed consumed balance of {formatCurrency((selectedBooking as any).balance_remaining || 0)}
                  </span>
                </p>
              ) : (
                <p className="text-[10px] text-slate-500 mt-1 font-medium">
                  Full settlement is required to generate the final financial report and release Room {selectedRoom.room_number}.
                </p>
              )}
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs font-bold text-slate-700">Payment Method</label>
              <select
                value={checkoutPaymentMethod}
                onChange={(e) =>
                  setCheckoutPaymentMethod(e.target.value as typeof checkoutPaymentMethod)
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-bold text-slate-900 outline-none focus:border-brand-500"
              >
                <option value="cash">💵 Cash</option>
                <option value="momo">📱 Mobile Money</option>
                <option value="card">💳 Credit / Debit Card</option>
                <option value="bank">🏦 Bank Transfer</option>
              </select>
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={() => setShowCheckoutModal(false)}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCheckout}
                disabled={
                  checkoutLoading ||
                  finalPayment > ((selectedBooking as any).balance_remaining || 0) ||
                  (((selectedBooking as any).balance_remaining || 0) > 0 &&
                    finalPayment < ((selectedBooking as any).balance_remaining || 0))
                }
                className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-rose-600 py-2.5 text-xs font-black text-white hover:bg-rose-700 transition disabled:opacity-50 shadow-soft"
              >
                {checkoutLoading ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <LogOut size={14} />
                )}
                <span>Finalize & Reconcile</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== EDIT PROPERTY ROOM MODAL ========== */}
      {showEditRoomModal && editingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-ink">Edit Room {editingRoom.room_number}</h2>
                <p className="text-xs text-slate-500 font-medium">Update room specifications and pricing.</p>
              </div>
              <button
                onClick={() => setShowEditRoomModal(false)}
                className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Room Number *</label>
                <input
                  type="text"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-sm font-bold outline-none focus:border-brand-500 focus:bg-white text-slate-900"
                  value={editRoomForm.room_number}
                  onChange={(e) => setEditRoomForm({ ...editRoomForm, room_number: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Floor / Wing</label>
                <input
                  type="text"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-semibold outline-none focus:border-brand-500 focus:bg-white text-slate-900"
                  value={editRoomForm.floor}
                  onChange={(e) => setEditRoomForm({ ...editRoomForm, floor: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Room Category</label>
                <select
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-bold outline-none text-slate-900"
                  value={editRoomForm.room_type}
                  onChange={(e) => setEditRoomForm({ ...editRoomForm, room_type: e.target.value })}
                >
                  {["Standard", "Deluxe", "Executive Suite", "VIP Suite", "Family Room", "Single"].map(
                    (t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nightly Rate (RWF) *</label>
                  <input
                    type="number"
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-bold outline-none focus:border-brand-500 focus:bg-white text-slate-900"
                    value={editRoomForm.price_per_night}
                    onChange={(e) =>
                      setEditRoomForm({ ...editRoomForm, price_per_night: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Max Guests</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-bold outline-none focus:border-brand-500 focus:bg-white text-slate-900"
                    value={editRoomForm.capacity}
                    onChange={(e) =>
                      setEditRoomForm({ ...editRoomForm, capacity: parseInt(e.target.value) || 1 })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 mt-5">
              <button
                onClick={() => setShowEditRoomModal(false)}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRoom}
                disabled={editRoomLoading}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-xs font-black text-white hover:bg-brand-700 transition disabled:opacity-50 shadow-soft"
              >
                {editRoomLoading ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Check size={14} />
                )}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== ROOM FOLIO STATEMENT MODAL ========== */}
      {showFolioModal && selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
              <div>
                <h2 className="text-base font-black text-ink">Guest Folio Statement</h2>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedBooking.guest_name} — Room {selectedBooking.room?.room_number || "—"}
                </p>
              </div>
              <button
                onClick={() => setShowFolioModal(false)}
                className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200 transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Guest Summary Card */}
            <div className="mb-3 grid grid-cols-2 gap-2.5 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs">
              <div>
                <p className="font-bold text-slate-400 text-[10px] uppercase">Check-In</p>
                <p className="mt-0.5 font-black text-slate-800">
                  {new Date(selectedBooking.check_in).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="font-bold text-slate-400 text-[10px] uppercase">Contact</p>
                <p className="mt-0.5 font-black text-slate-800">
                  {selectedBooking.guest_phone || "No phone recorded"}
                </p>
              </div>
            </div>

            {/* Itemized Charges */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto mb-3 text-xs">
              <div className="flex justify-between rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 font-semibold">
                <span className="text-slate-700">Room Base Rate</span>
                <span className="font-black text-slate-900">
                  {formatCurrency(selectedBooking.room_rate)}
                </span>
              </div>

              {((selectedBooking as any).charges || []).map((c: any, i: number) => (
                <div key={i} className="rounded-xl bg-brand-50/60 border border-brand-100 px-3.5 py-2">
                  <div className="flex justify-between font-bold text-slate-900">
                    <span className="flex items-center gap-1.5">
                      <Utensils size={12} className="text-brand-600" />
                      {c.description}
                    </span>
                    <span className="font-black text-brand-700">{formatCurrency(c.amount)}</span>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-0.5">
                    {new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>

            {/* Payments List with "Record Payment in Tab" Button */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Payments Received
                </p>
                <button
                  onClick={() => openRecordPayment(selectedBooking)}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 transition"
                >
                  <Plus size={11} />
                  <span>Record Payment in Tab</span>
                </button>
              </div>

              <div className="space-y-1 text-xs">
                {selectedBooking.advance_paid > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5">
                    <span className="font-bold text-emerald-800">ADVANCE DEPOSIT</span>
                    <span className="font-black text-emerald-700">-{formatCurrency(selectedBooking.advance_paid)}</span>
                  </div>
                )}
                {((selectedBooking as any).payments || []).map((payment: any) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5"
                  >
                    <span className="font-bold text-emerald-800">
                      {payment.payment_method.toUpperCase()}
                    </span>
                    <span className="font-black text-emerald-700">
                      -{formatCurrency(payment.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Grand Summary */}
            <div className="rounded-xl bg-slate-900 p-3.5 text-white text-xs space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Total Billed Charges:</span>
                <span className="font-bold text-white">
                  {formatCurrency(
                    Number(selectedBooking.room_rate || 0) + Number(selectedBooking.total_charges || 0)
                  )}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total Paid to Date:</span>
                <span className="text-emerald-400 font-bold">
                  -{formatCurrency((selectedBooking.advance_paid || 0) + (selectedBooking.total_payments || 0))}
                </span>
              </div>
              <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-800">
                <span>Net Balance Due:</span>
                <span
                  className={
                    (selectedBooking.balance_remaining || 0) > 0 ? "text-rose-400" : "text-emerald-400"
                  }
                >
                  {formatCurrency(selectedBooking.balance_remaining || 0)}
                </span>
              </div>
            </div>

            <div className="flex gap-2.5 mt-4">
              <button
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
              >
                <Printer size={13} />
                <span>Print Folio</span>
              </button>
              <button
                onClick={() => setShowFolioModal(false)}
                className="flex-1 rounded-xl bg-brand-600 py-2.5 text-xs font-black text-white hover:bg-brand-700 transition shadow-xs"
              >
                Close Statement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== ADD PROPERTY ROOM MODAL ========== */}
      {showAddRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-ink">Add Property Room</h2>
              <button
                onClick={() => setShowAddRoomModal(false)}
                className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Room Number *</label>
                <input
                  type="text"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-sm font-bold outline-none focus:border-brand-500 focus:bg-white text-slate-900"
                  placeholder="e.g. 101 or Suite 2"
                  value={newRoom.room_number}
                  onChange={(e) => setNewRoom({ ...newRoom, room_number: e.target.value })}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Floor / Wing</label>
                <input
                  type="text"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-semibold outline-none focus:border-brand-500 focus:bg-white text-slate-900"
                  placeholder="e.g. Floor 1, East Wing"
                  value={newRoom.floor}
                  onChange={(e) => setNewRoom({ ...newRoom, floor: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Room Category</label>
                <select
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-bold outline-none text-slate-900"
                  value={newRoom.room_type}
                  onChange={(e) => setNewRoom({ ...newRoom, room_type: e.target.value })}
                >
                  {["Standard", "Deluxe", "Executive Suite", "VIP Suite", "Family Room", "Single"].map(
                    (t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nightly Rate (RWF) *</label>
                  <input
                    type="number"
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-bold outline-none focus:border-brand-500 focus:bg-white text-slate-900"
                    placeholder="0"
                    value={newRoom.price_per_night || ""}
                    onChange={(e) =>
                      setNewRoom({ ...newRoom, price_per_night: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Max Guests</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-bold outline-none focus:border-brand-500 focus:bg-white text-slate-900"
                    value={newRoom.capacity}
                    onChange={(e) =>
                      setNewRoom({ ...newRoom, capacity: parseInt(e.target.value) || 1 })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 mt-5">
              <button
                onClick={() => setShowAddRoomModal(false)}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRoom}
                disabled={addRoomLoading}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-xs font-black text-white hover:bg-brand-700 transition disabled:opacity-50 shadow-soft"
              >
                {addRoomLoading ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Plus size={15} />
                )}
                <span>Save Room</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room QR Code Modal */}
      {qrTargetRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-slate-200 p-6 shadow-2xl text-center">
            <div className="mb-4 flex items-center justify-between text-left">
              <div>
                <h2 className="text-xl font-black text-slate-900">Room QR Menu</h2>
                <p className="text-xs font-semibold text-slate-500">
                  Room {qrTargetRoom.room_number} · {qrTargetRoom.room_type}
                </p>
              </div>
              <button
                onClick={() => setQrTargetRoom(null)}
                className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200 transition"
              >
                <X size={18} />
              </button>
            </div>

            {(() => {
              const token = qrTargetRoom.qr_token || qrTargetRoom.id;
              const qrUrl = `${window.location.origin}/guest-order/room/${token}`;
              return (
                <div>
                  <img
                    className="mx-auto h-52 w-52 rounded-2xl border border-slate-200 bg-white p-2 shadow-xs"
                    alt={`Room ${qrTargetRoom.room_number} QR code`}
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=8&data=${encodeURIComponent(qrUrl)}`}
                  />

                  <p className="mt-4 break-all rounded-xl bg-slate-50 p-3 text-left text-[10px] font-mono text-slate-600 border border-slate-200">
                    {qrUrl}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(qrUrl);
                        showToast("success", "Room QR menu link copied to clipboard.");
                      }}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 py-3 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
                    >
                      <Copy size={15} /> Copy link
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-slate-950 py-3 text-xs font-bold text-white hover:bg-slate-800 transition"
                    >
                      <Printer size={15} /> Print QR
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
