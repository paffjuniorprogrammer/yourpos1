import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Search, Plus, Minus, Trash2, Receipt, LogOut, LayoutDashboard,
  Calculator, Clock3, X, ShoppingCart, BedDouble, UtensilsCrossed,
  Printer, ChevronDown, Percent, User, CreditCard, Smartphone, Wallet,
  History, CheckCircle2, AlertTriangle, RefreshCw, Delete, Bell,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { listProducts } from "../services/productService";
import { listPosCustomers, getShopSettings, createPosSale } from "../services/posService";
import { roomService } from "../services/roomService";
import { tableService } from "../services/tableService";
import { dayCloseService } from "../services/dayCloseService";
import { guestOrderService, type GuestOrder } from "../services/guestOrderService";
import { formatCurrency } from "../lib/format";
import { createPortal } from "react-dom";
import type { PosCustomerRecord, PaymentMethod, ShopSettingsRecord, ProductRecord } from "../types/database";
import type { RoomBookingRecord, DiningTableRecord, ActiveTabRecord, HospitalityDayClosureRecord } from "../types/database";

type CartItem = {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  category_name?: string | null;
  image_url?: string | null;
  stock_quantity: number;
};

type ActivePaymentMethod = "cash" | "momo" | "card" | "room_folio";

const DRAFT_STORAGE_PREFIX = "bar_pos_draft_";

export function BarPosPage() {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { showToast, confirm } = useNotification();
  const businessId = profile?.business_id || "";

  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [customers, setCustomers] = useState<PosCustomerRecord[]>([]);
  const [settings, setSettings] = useState<ShopSettingsRecord | null>(null);
  const [activeBookings, setActiveBookings] = useState<RoomBookingRecord[]>([]);
  const [tables, setTables] = useState<DiningTableRecord[]>([]);
  const [openTabs, setOpenTabs] = useState<ActiveTabRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTable, setSelectedTable] = useState<DiningTableRecord | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<RoomBookingRecord | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomerRecord | null>(null);
  const [discount, setDiscount] = useState(0);
  const [resumedTabId, setResumedTabId] = useState<string | null>(null);

  // Modals state
  const [showPayModal, setShowPayModal] = useState(false);
  const [showTabsModal, setShowTabsModal] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [showCloseDayModal, setShowCloseDayModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<ActivePaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [processing, setProcessing] = useState(false);

  // Calculator State
  const [calcDisplay, setCalcDisplay] = useState("0");
  const [calcEquation, setCalcEquation] = useState("");
  const [calcResetOnNext, setCalcResetOnNext] = useState(false);

  // Closing Day State
  const [dailySummary, setDailySummary] = useState<any>(null);
  const [closureNotes, setClosureNotes] = useState("");
  const [closingDayLoading, setClosingDayLoading] = useState(false);
  const [closedSummaryRecord, setClosedSummaryRecord] = useState<HospitalityDayClosureRecord | null>(null);
  const [activeRegister, setActiveRegister] = useState<any | null>(null);
  const [showOpenRegister, setShowOpenRegister] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [openingRegister, setOpeningRegister] = useState(false);
  const [pendingGuestOrders, setPendingGuestOrders] = useState<GuestOrder[]>([]);
  const [showGuestOrders, setShowGuestOrders] = useState(false);
  const [reviewingGuestOrder, setReviewingGuestOrder] = useState<string | null>(null);
  const previousPendingQrCount = useRef(0);

  // Restore unsaved cart from local storage on first load (power cut / wifi resilience)
  useEffect(() => {
    if (!businessId) return;
    try {
      const savedDraft = localStorage.getItem(DRAFT_STORAGE_PREFIX + businessId);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCart(parsed);
        }
      }
    } catch {}
  }, [businessId]);

  // Persist current cart draft to local storage
  useEffect(() => {
    if (!businessId) return;
    try {
      if (cart.length > 0) {
        localStorage.setItem(DRAFT_STORAGE_PREFIX + businessId, JSON.stringify(cart));
      } else {
        localStorage.removeItem(DRAFT_STORAGE_PREFIX + businessId);
      }
    } catch {}
  }, [cart, businessId]);

  // Load Real Data
  const loadData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [prods, custs, sett, bookings, tbls, tabs, register] = await Promise.all([
        listProducts(profile?.location_id || null, businessId).catch(() => []),
        listPosCustomers().catch(() => []),
        getShopSettings(businessId).catch(() => null),
        roomService.listActiveBookings(businessId).catch(() => []),
        tableService.listTables(businessId).catch(() => []),
        tableService.listOpenTabs(businessId).catch(() => []),
        dayCloseService.getOpenRegister(businessId).catch(() => null),
      ]);

      setProducts(prods as ProductRecord[]);
      setCustomers(custs as PosCustomerRecord[]);
      setSettings(sett as ShopSettingsRecord | null);
      setActiveBookings(bookings as RoomBookingRecord[]);
      setTables(tbls as DiningTableRecord[]);
      setOpenTabs(tabs as ActiveTabRecord[]);
      setActiveRegister(register);
      setShowOpenRegister(!register);
    } catch (err: any) {
      console.error("Failed to load bar POS data:", err);
      showToast("error", "Failed to load bar inventory and data");
    } finally {
      setLoading(false);
    }
  }, [businessId, profile?.location_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadPendingGuestOrders = useCallback(async () => {
    if (!businessId) return;
    try { setPendingGuestOrders(await guestOrderService.listPending(businessId)); } catch { /* menu inbox may be unavailable until migration is applied */ }
  }, [businessId]);

  useEffect(() => {
    void loadPendingGuestOrders();
    const interval = window.setInterval(() => void loadPendingGuestOrders(), 12000);
    return () => window.clearInterval(interval);
  }, [loadPendingGuestOrders]);

  useEffect(() => {
    if (pendingGuestOrders.length > previousPendingQrCount.current) {
      try {
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        const audio = new AudioContextClass();
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.08, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35);
        oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + 0.35);
      } catch { /* Browser may require a cashier interaction before audio is allowed. */ }
    }
    previousPendingQrCount.current = pendingGuestOrders.length;
  }, [pendingGuestOrders.length]);

  const reviewGuestOrder = async (order: GuestOrder, accepted: boolean) => {
    if (!profile?.id) return;
    setReviewingGuestOrder(order.id);
    try {
      await guestOrderService.review(order.id, profile.id, accepted);
      setPendingGuestOrders((orders) => orders.filter((item) => item.id !== order.id));
      showToast("success", accepted ? "Customer order accepted as a held tab." : "Customer order rejected.");
      if (accepted) { await loadData(); setShowTabsModal(true); }
    } catch (error: any) { showToast("error", error.message || "Could not review customer order"); }
    finally { setReviewingGuestOrder(null); }
  };

  // Categories extracted dynamically from products + standard bar categories
  const categories = useMemo(() => {
    const rawCats = products.map((p) => (p as any).category || p.category_id || "General");
    const unique = Array.from(new Set(rawCats.filter(Boolean)));
    const defaults = ["Beer", "Soft Drinks", "Wines", "Spirits", "Food", "Snacks", "Water"];
    const merged = Array.from(new Set(["All", ...unique, ...defaults]));
    return merged;
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const prodCategory = (p as any).category || "General";
      const matchCat =
        selectedCategory === "All" ||
        prodCategory.toLowerCase() === selectedCategory.toLowerCase();
      const matchQ =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.barcode && p.barcode.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchQ;
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart calculations
  const subtotal = cart.reduce((acc, i) => acc + i.line_total, 0);
  const taxRate = (settings as any)?.tax_rate || 0;
  const taxAmount = Math.round((subtotal * taxRate) / 100);
  const discountAmount = Math.round((subtotal * discount) / 100);
  const total = subtotal + taxAmount - discountAmount;

  const addToCart = (product: ProductRecord) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id
            ? { ...i, quantity: i.quantity + 1, line_total: (i.quantity + 1) * i.unit_price }
            : i
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          unit_price: product.selling_price,
          quantity: 1,
          line_total: product.selling_price,
          category_name: (product as any).category || "General",
          image_url: product.image_url,
          stock_quantity: product.stock_quantity ?? 0,
        },
      ];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product_id === productId
            ? { ...i, quantity: i.quantity + delta, line_total: (i.quantity + delta) * i.unit_price }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  const removeFromCart = (productId: string) =>
    setCart((prev) => prev.filter((i) => i.product_id !== productId));

  const clearCart = () => {
    setCart([]);
    setSelectedTable(null);
    setSelectedRoom(null);
    setSelectedCustomer(null);
    setDiscount(0);
    setAmountPaid("");
    setResumedTabId(null);
    try {
      localStorage.removeItem(DRAFT_STORAGE_PREFIX + businessId);
    } catch {}
  };

  // Hold Order - Requires Table, Room, or Customer
  const holdOrder = () => {
    if (cart.length === 0) return;

    if (!selectedTable && !selectedRoom && !selectedCustomer) {
      showToast("error", "⚠️ Please select a Table, Room, or Customer before holding the order!");
      return;
    }

    const tabName = selectedRoom
      ? `Room ${(selectedRoom as any).room?.room_number || "?"} - ${selectedRoom.guest_name}`
      : selectedTable
      ? `Table ${selectedTable.table_number}`
      : selectedCustomer
      ? selectedCustomer.full_name
      : `Tab ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    const localTabId = resumedTabId || `local-tab-${Date.now()}`;

    // Optimistic UI: instantly add/update the tab in local state (no reload, no spinner)
    const optimisticTab: ActiveTabRecord = {
      id: localTabId,
      business_id: businessId,
      table_id: selectedTable?.id || null,
      booking_id: selectedRoom?.id || null,
      customer_id: selectedCustomer?.id || null,
      tab_name: tabName,
      cart_items: [...cart],
      subtotal,
      tax: taxAmount,
      discount: discountAmount,
      total,
      status: "open",
      created_by: profile?.id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      table: selectedTable || undefined,
      booking: selectedRoom || undefined,
    };

    if (resumedTabId) {
      setOpenTabs((prev) => prev.map((t) => t.id === resumedTabId ? optimisticTab : t));
    } else {
      setOpenTabs((prev) => [optimisticTab, ...prev]);
    }

    showToast("success", `Order held as "${tabName}" 📌`);

    // Capture current cart/context before clearing
    const snapCart = [...cart];
    const snapSubtotal = subtotal;
    const snapTax = taxAmount;
    const snapDiscount = discountAmount;
    const snapTotal = total;
    const snapTable = selectedTable;
    const snapRoom = selectedRoom;
    const snapCustomer = selectedCustomer;
    const snapResId = resumedTabId;

    clearCart();

    // Background sync - non-blocking, fire and forget
    tableService.saveOrHoldTab({
      id: snapResId || undefined,
      business_id: businessId,
      table_id: snapTable?.id || null,
      booking_id: snapRoom?.id || null,
      customer_id: snapCustomer?.id || null,
      tab_name: tabName,
      cart_items: snapCart,
      subtotal: snapSubtotal,
      tax: snapTax,
      discount: snapDiscount,
      total: snapTotal,
      created_by: profile?.id,
    }).then((savedTab) => {
      setOpenTabs((prev) => prev.map((t) =>
        t.id === localTabId ? { ...optimisticTab, id: savedTab.id } : t
      ));
      if (snapTable) {
        tableService.updateTableStatus(snapTable.id, "occupied").catch(() => {});
      }
    }).catch(() => {
      // Tab still lives in localStorage - safe
    });
  };

  // Resume a held tab
  const resumeTab = (tab: ActiveTabRecord) => {
    setCart(tab.cart_items || []);
    setSelectedTable(tab.table || null);
    setSelectedRoom(tab.booking || null);
    setSelectedCustomer(tab.customer_id ? customers.find((c) => c.id === tab.customer_id) || null : null);
    setDiscount(0);
    setResumedTabId(tab.id);
    setShowTabsModal(false);
    showToast("success", `Resumed order: ${tab.tab_name}`);
  };

  // Pay Now - Completes and records sale
  const handlePayNow = async () => {
    if (cart.length === 0) return;
    if (paymentMethod !== "room_folio" && (!amountPaid || parseFloat(amountPaid) < total)) {
      showToast("error", "Amount paid must be ≥ total");
      return;
    }
    if (paymentMethod === "room_folio" && !selectedRoom) {
      showToast("error", "Please select an active guest room to charge to folio");
      return;
    }
    setProcessing(true);
    try {
      // A room-folio order consumes stock now, but it is not cash received by
      // the bar cashier. Record it as credit until reception settles the folio.
      const isRoomFolio = paymentMethod === "room_folio";

      // Build clear context notes for the Sales table
      const saleNotes = selectedTable
        ? `Table ${selectedTable.table_number}`
        : selectedRoom
        ? `Room ${(selectedRoom as any).room?.room_number || "?"} (${selectedRoom.guest_name})`
        : selectedCustomer
        ? selectedCustomer.full_name
        : "Direct Counter Sale";

      const sale = await createPosSale({
        business_id: businessId,
        location_id: profile?.location_id || null,
        customer_id: selectedCustomer?.id || null,
        cashier_id: profile?.id || "",
        items: cart.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          line_total: i.line_total,
        })),
        payments: isRoomFolio ? [] : [{ payment_method: paymentMethod as PaymentMethod, amount: total }],
        payment_method: isRoomFolio ? "credit" : paymentMethod as PaymentMethod,
        payment_status: isRoomFolio ? "unpaid" : "paid",
        subtotal,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        discount_type: discountAmount > 0 ? "fixed" : null,
        total_amount: total,
        notes: saleNotes,
      });

      console.log("✅ SALE CREATED successfully!");
      console.log(`   💼 Sale ID: ${(sale as any)?.id || "unknown"}`);
      console.log(`   💰 Amount: ${total} RWF`);
      console.log(`   💳 Method: ${paymentMethod}`);
      console.log(`   📝 Notes: ${saleNotes}`);
      console.log(`   🏢 Business: ${businessId}`);

      // Post every room-folio item to the guest bill. The room charge keeps the
      // accepting cashier (created_by), while the cash is collected later by reception.
      if (isRoomFolio && selectedRoom) {
        for (const item of cart) {
          const svcType = ["Food", "Snacks"].includes(item.category_name || "") ? "food" : "bar";
          await roomService.postChargeToRoom({
            business_id: businessId,
            booking_id: selectedRoom.id,
            sale_id: (sale as any)?.id,
            service_type: svcType,
            description: item.name,
            amount: item.line_total,
            quantity: item.quantity,
            created_by: profile?.id,
          });
        }
      }

      // Close the held tab if this was a resumed tab
      if (resumedTabId) {
        // Immediately remove it from UI state — no reload needed
        setOpenTabs((prev) => prev.filter((t) => t.id !== resumedTabId));
        tableService.closeTab(resumedTabId, selectedTable?.id).catch(() => {});
      } else if (selectedTable) {
        tableService.updateTableStatus(selectedTable.id, "available").catch(() => {});
      }

      showToast("success", `Sale recorded! [${saleNotes}] Total: ${formatCurrency(total)} 🎉`);
      setShowPayModal(false);
      clearCart();
    } catch (err: any) {
      showToast("error", err.message || "Sale failed");
    } finally {
      setProcessing(false);
    }
  };

  const change = paymentMethod !== "room_folio" ? Math.max(0, parseFloat(amountPaid || "0") - total) : 0;

  // Calculator Functions
  const handleCalcNumber = (num: string) => {
    if (calcResetOnNext || calcDisplay === "0") {
      setCalcDisplay(num);
      setCalcResetOnNext(false);
    } else {
      setCalcDisplay(calcDisplay + num);
    }
  };

  const handleCalcOp = (op: string) => {
    setCalcEquation(`${calcDisplay} ${op} `);
    setCalcResetOnNext(true);
  };

  const handleCalcEquals = () => {
    if (!calcEquation) return;
    try {
      const fullExp = `${calcEquation}${calcDisplay}`.replace(/×/g, "*").replace(/÷/g, "/");
      // eslint-disable-next-line no-eval
      const result = Function(`'use strict'; return (${fullExp})`)();
      setCalcDisplay(String(result));
      setCalcEquation("");
      setCalcResetOnNext(true);
    } catch (e) {
      setCalcDisplay("Error");
      setCalcResetOnNext(true);
    }
  };

  const handleCalcClear = () => {
    setCalcDisplay("0");
    setCalcEquation("");
    setCalcResetOnNext(false);
  };

  // Open Close Day Modal
  const handleOpenCloseDay = async () => {
    if (!activeRegister) { setShowOpenRegister(true); return; }
    try {
      const summary = await dayCloseService.getDailySummary(businessId);
      setDailySummary(summary);
      setShowCloseDayModal(true);
    } catch (err) {
      showToast("error", "Failed to load shift summary");
    }
  };

  const handleOpenRegister = async () => {
    if (!profile?.id || !businessId) return;
    setOpeningRegister(true);
    try {
      const register = await dayCloseService.openRegister({
        business_id: businessId,
        user_id: profile.id,
        location_id: profile.location_id,
        opening_cash: Number(openingCash || 0),
      });
      setActiveRegister(register);
      setOpeningCash("");
      setShowOpenRegister(false);
      showToast("success", "Bar register opened. QR customers can now send orders.");
    } catch (error: any) {
      showToast("error", error.message || "Could not open the bar register");
    } finally { setOpeningRegister(false); }
  };

  // Finalize Close Day
  const handleFinalizeCloseDay = async () => {
    if (!dailySummary) return;
    const ok = await confirm(
      "Confirm Day Closure",
      "Are you sure you want to finalize today's Bar & Kitchen sales and close the register? (Room payments are tracked separately)"
    );
    if (!ok) return;

    setClosingDayLoading(true);
    try {
      const saved = await dayCloseService.saveClosure({
        business_id: businessId,
        closure_date: dailySummary.date,
        register_id: activeRegister?.id,
        user_id: profile?.id,
        location_id: profile?.location_id,
        closed_by: profile?.id,
        total_sales: dailySummary.totalSales,
        cash_received: dailySummary.cashReceived,
        momo_received: dailySummary.momoReceived,
        card_received: dailySummary.cardReceived,
        room_revenue: 0, // NOT INCLUDED - rooms are separate system
        total_expenses: dailySummary.totalExpenses,
        net_profit: dailySummary.netProfit,
        notes: closureNotes,
      });

      setClosedSummaryRecord(saved);
      setActiveRegister(null);
      showToast("success", "Day closed successfully! Bar & Kitchen reconciliation complete 📊");
    } catch (err: any) {
      showToast("error", err.message || "Failed to close day");
    } finally {
      setClosingDayLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="text-center text-white">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
          <p className="font-bold text-lg">Loading Bar & Guest POS...</p>
          <p className="text-xs text-slate-400 mt-1">Connecting to products, stock and rooms</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-white select-none">
      {/* ========== LEFT: PRODUCTS (50%) ========== */}
      <div className="flex w-1/2 flex-col border-r border-white/10">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-slate-900/60">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 font-black text-base shadow-lg shadow-amber-500/20">
              🍻
            </div>
            <div>
              <span className="font-black text-sm block leading-tight">{settings?.shop_name || "Bar POS"}</span>
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Hospitality Mode</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowGuestOrders(true); void loadPendingGuestOrders(); }}
              className="relative flex h-8 items-center justify-center rounded-xl bg-sky-500/20 px-2 text-sky-300 hover:bg-sky-500 hover:text-slate-950 transition"
              title="Customer QR orders"
            >
              <Bell size={16} />
              {pendingGuestOrders.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">{pendingGuestOrders.length}</span>}
            </button>
            <button
              onClick={handleOpenCloseDay}
              disabled={!activeRegister}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-300 border border-amber-500/30 hover:bg-amber-500 hover:text-slate-950 transition"
              title="Closing Day / Shift Settlement"
            >
              <Receipt size={14} />
              <span>Close Day</span>
            </button>
            <button
              onClick={() => setShowCalc(true)}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-slate-300 hover:bg-white/20 transition"
              title="Calculator"
            >
              <Calculator size={16} />
            </button>
            <button
              onClick={() => loadData()}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-slate-300 hover:bg-white/20 transition"
              title="Refresh Products"
            >
              <RefreshCw size={15} />
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-slate-300 hover:bg-white/20 transition"
              title="Dashboard"
            >
              <LayoutDashboard size={16} />
            </button>
            <button
              onClick={() => logout()}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition"
              title="Log Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-white/10 bg-slate-900/30">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search drinks, food, chicken, barcode..."
              className="w-full rounded-2xl bg-white/10 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-amber-500/50 transition font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Category filters */}
        <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-white/10 bg-slate-900/20 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-black uppercase tracking-wider transition ${
                selectedCategory.toLowerCase() === cat.toLowerCase()
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 scale-105"
                  : "bg-white/10 text-slate-300 hover:bg-white/20"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const stock = product.stock_quantity ?? 0;
              const isLow = stock > 0 && stock <= (product.reorder_level || 5);
              const isOut = stock <= 0;

              return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="group flex flex-col overflow-hidden rounded-2xl bg-white/5 border border-white/10 text-left hover:bg-white/10 hover:border-amber-500/50 hover:shadow-lg transition-all active:scale-95"
                >
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="h-24 w-full object-cover" />
                  ) : (
                    <div className="flex h-24 items-center justify-center bg-slate-900 text-3xl">
                      {(product as any).category === "Beer" ? "🍺" :
                       (product as any).category === "Wines" ? "🍷" :
                       (product as any).category === "Spirits" ? "🥃" :
                       (product as any).category === "Food" ? "🍗" :
                       (product as any).category === "Snacks" ? "🍟" :
                       (product as any).category === "Soft Drinks" ? "🥤" : "🍾"}
                    </div>
                  )}
                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <p className="text-xs font-bold text-white line-clamp-2">{product.name}</p>
                      <p className="mt-1 text-xs text-amber-400 font-black">{formatCurrency(product.selling_price)}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${
                        isOut ? "bg-rose-500/20 text-rose-400" :
                        isLow ? "bg-amber-500/20 text-amber-400" :
                        "bg-emerald-500/20 text-emerald-400"
                      }`}>
                        Stock: {stock}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredProducts.length === 0 && (
              <div className="col-span-3 xl:col-span-4 py-16 text-center text-slate-500">
                <ShoppingCart size={40} className="mx-auto mb-3 text-slate-600" />
                <p className="text-base font-bold text-slate-400">No products found</p>
                <p className="text-xs text-slate-600 mt-1">Check search query or add products from the Products menu</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========== RIGHT: ORDER / CART (50%) ========== */}
      <div className="flex w-1/2 flex-col bg-slate-900/40">
        {/* Context selectors (Table / Customer / Room) */}
        <div className="grid grid-cols-3 gap-2 border-b border-white/10 p-3 bg-slate-900/80">
          {/* Table Selector */}
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">🪑 Table</label>
            <select
              value={selectedTable?.id || ""}
              onChange={(e) => setSelectedTable(tables.find((t) => t.id === e.target.value) || null)}
              className="w-full rounded-xl bg-slate-800 border border-white/20 px-3 py-2 text-xs font-bold text-white outline-none focus:ring-1 focus:ring-amber-500"
              style={{ backgroundColor: "#1e293b", color: "#ffffff" }}
            >
              <option value="" style={{ backgroundColor: "#0f172a", color: "#ffffff" }}>Select Table</option>
              {tables.map((t) => (
                <option
                  key={t.id}
                  value={t.id}
                  style={{ backgroundColor: "#0f172a", color: t.status === "occupied" ? "#f87171" : "#4ade80" }}
                >
                  Table {t.table_number} ({t.status})
                </option>
              ))}
            </select>
          </div>

          {/* Customer Selector */}
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">👤 Customer</label>
            <select
              value={selectedCustomer?.id || ""}
              onChange={(e) => setSelectedCustomer(customers.find((c) => c.id === e.target.value) || null)}
              className="w-full rounded-xl bg-slate-800 border border-white/20 px-3 py-2 text-xs font-bold text-white outline-none focus:ring-1 focus:ring-amber-500"
              style={{ backgroundColor: "#1e293b", color: "#ffffff" }}
            >
              <option value="" style={{ backgroundColor: "#0f172a", color: "#ffffff" }}>Select Customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id} style={{ backgroundColor: "#0f172a", color: "#ffffff" }}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Room Selector */}
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-amber-400 mb-1">🛏️ Charge to Room</label>
            <select
              value={selectedRoom?.id || ""}
              onChange={(e) => {
                const b = activeBookings.find((bk) => bk.id === e.target.value) || null;
                setSelectedRoom(b);
                if (b) setPaymentMethod("room_folio");
              }}
              className="w-full rounded-xl bg-amber-500/20 border border-amber-500/40 px-3 py-2 text-xs font-black text-amber-300 outline-none focus:ring-1 focus:ring-amber-400"
              style={{ backgroundColor: "#1e293b", color: "#fcd34d" }}
            >
              <option value="" style={{ backgroundColor: "#0f172a", color: "#ffffff" }}>No Room (Direct)</option>
              {activeBookings.map((b) => (
                <option key={b.id} value={b.id} style={{ backgroundColor: "#0f172a", color: "#fcd34d" }}>
                  Room {(b as any).room?.room_number} – {b.guest_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Room or Resumed Tab Banner */}
        <div className="space-y-1 px-3 pt-2">
          {selectedRoom && (
            <div className="flex items-center justify-between rounded-xl bg-amber-500/20 px-3 py-2 border border-amber-500/40">
              <div className="flex items-center gap-2">
                <BedDouble size={16} className="text-amber-400 shrink-0" />
                <p className="text-xs font-bold text-amber-300">
                  Folio: Room {(selectedRoom as any).room?.room_number} ({selectedRoom.guest_name})
                </p>
              </div>
              <button onClick={() => setSelectedRoom(null)} className="text-amber-400 hover:text-white">
                <X size={14} />
              </button>
            </div>
          )}
          {resumedTabId && (
            <div className="flex items-center justify-between rounded-xl bg-sky-500/20 px-3 py-1.5 border border-sky-500/40">
              <span className="text-[11px] font-bold text-sky-300">Resumed Held Tab</span>
              <button onClick={() => setResumedTabId(null)} className="text-sky-300 hover:text-white text-xs font-bold">
                Detach
              </button>
            </div>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-slate-500">
              <ShoppingCart size={48} className="mb-3 text-slate-700" />
              <p className="text-sm font-bold text-slate-400">Order is empty</p>
              <p className="text-xs text-slate-600 mt-1">Tap drinks, food or chicken on the left to add</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.product_id} className="flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 p-3 hover:bg-white/10 transition">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-white truncate">{item.name}</p>
                  <p className="text-[10px] text-amber-400 font-bold">{formatCurrency(item.unit_price)} each</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQty(item.product_id, -1)}
                    className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 hover:bg-rose-500/30 hover:text-rose-300 transition"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="text-xs font-black w-6 text-center">{item.quantity}</span>
                  <button
                    onClick={() => updateQty(item.product_id, 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 hover:bg-emerald-500/30 hover:text-emerald-300 transition"
                  >
                    <Plus size={13} />
                  </button>
                  <span className="text-xs font-black text-white w-20 text-right">{formatCurrency(item.line_total)}</span>
                  <button
                    onClick={() => removeFromCart(item.product_id)}
                    className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-500 hover:bg-rose-500/20 hover:text-rose-400 transition"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals Section */}
        <div className="border-t border-white/10 bg-slate-900/70 px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {taxAmount > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Tax ({taxRate}%)</span>
              <span>{formatCurrency(taxAmount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Percent size={12} />
              <input
                type="number"
                min={0}
                max={100}
                value={discount || ""}
                onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-12 bg-white/10 rounded px-1.5 py-0.5 text-white outline-none text-xs font-bold"
                placeholder="0"
              />
              <span>% Discount</span>
            </div>
            <span className="text-rose-400">-{formatCurrency(discountAmount)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 pt-2 text-lg font-black text-white">
            <span>TOTAL</span>
            <span className="text-amber-400 text-xl">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2 p-3 border-t border-white/10 bg-slate-950">
          <button
            onClick={() => setShowTabsModal(true)}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-xs font-bold text-slate-300 hover:bg-white/20 transition"
          >
            <Clock3 size={15} />
            Held Tabs ({openTabs.length})
          </button>
          <button
            onClick={holdOrder}
            disabled={cart.length === 0}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-xs font-bold text-slate-300 hover:bg-white/20 transition disabled:opacity-40"
          >
            <History size={15} />
            Hold Tab
          </button>
          <button
            onClick={clearCart}
            disabled={cart.length === 0}
            className="flex items-center justify-center gap-2 rounded-2xl bg-rose-500/20 py-3.5 text-xs font-bold text-rose-400 hover:bg-rose-500/30 transition disabled:opacity-40"
          >
            <Trash2 size={15} />
            Clear
          </button>
          <button
            onClick={() => {
              setAmountPaid(total.toString());
              setShowPayModal(true);
            }}
            disabled={cart.length === 0}
            className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 py-3.5 text-xs font-black text-slate-950 hover:opacity-95 shadow-lg shadow-amber-500/20 transition disabled:opacity-40 active:scale-95"
          >
            <Receipt size={16} />
            Pay {formatCurrency(total)}
          </button>
        </div>
      </div>

      {/* ========== PAYMENT MODAL ========== */}
      {showPayModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-white/10 p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-white">Settle Bill</h2>
              <button onClick={() => setShowPayModal(false)} className="rounded-full bg-white/10 p-1.5 text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 rounded-2xl bg-white/5 border border-white/10 p-4">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Total Due (Bar & Food)</p>
              <p className="text-3xl font-black text-amber-400">{formatCurrency(total)}</p>
              {selectedRoom && (
                <p className="mt-1 text-xs text-amber-300 font-bold">
                  🛏️ Charged to Room {(selectedRoom as any).room?.room_number} – {selectedRoom.guest_name}
                </p>
              )}
            </div>

            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Select Method</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { method: "cash" as const, label: "Cash", icon: Wallet },
                  { method: "momo" as const, label: "Mobile Money", icon: Smartphone },
                  { method: "card" as const, label: "Card", icon: CreditCard },
                  { method: "room_folio" as const, label: "Room Folio", icon: BedDouble },
                ] as const).map(({ method, label, icon: Icon }) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`flex items-center gap-2.5 rounded-2xl p-3 text-xs font-bold border transition ${
                      paymentMethod === method
                        ? "border-amber-500 bg-amber-500/20 text-amber-300 shadow-md"
                        : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod !== "room_folio" && (
              <div className="mb-5">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Amount Received</p>
                <input
                  type="number"
                  className="w-full rounded-2xl bg-white/10 border border-white/20 px-4 py-3 text-2xl font-black text-white outline-none focus:border-amber-500 transition"
                  placeholder="0"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  autoFocus
                />
                {change > 0 && (
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-500/20 px-3 py-2 border border-emerald-500/30">
                    <span className="text-xs font-bold text-emerald-300">Change to return:</span>
                    <span className="text-sm font-black text-emerald-400">{formatCurrency(change)}</span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handlePayNow}
              disabled={processing}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 py-4 font-black text-slate-950 hover:bg-amber-400 transition disabled:opacity-50 shadow-xl shadow-amber-500/20"
            >
              {processing ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  {paymentMethod === "room_folio" ? "Charge to Room Folio" : "Complete & Print"}
                </>
              )}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ========== WORKING CALCULATOR MODAL ========== */}
      {showCalc && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xs rounded-3xl bg-slate-900 border border-white/15 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calculator size={18} className="text-amber-400" />
                <h3 className="font-black text-sm text-white">POS Calculator</h3>
              </div>
              <button onClick={() => setShowCalc(false)} className="rounded-full bg-white/10 p-1.5 text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            {/* Screen */}
            <div className="mb-4 rounded-2xl bg-slate-950 border border-white/10 p-4 text-right">
              <p className="text-xs text-slate-500 font-mono h-4">{calcEquation || " "}</p>
              <p className="text-2xl font-black text-amber-400 font-mono truncate">{calcDisplay}</p>
            </div>

            {/* Keys */}
            <div className="grid grid-cols-4 gap-2">
              <button onClick={handleCalcClear} className="col-span-2 rounded-xl bg-rose-500/20 py-3 font-black text-rose-400 text-sm hover:bg-rose-500/30">C</button>
              <button onClick={() => setCalcDisplay(calcDisplay.length > 1 ? calcDisplay.slice(0, -1) : "0")} className="rounded-xl bg-white/10 py-3 font-bold text-slate-300 text-sm hover:bg-white/20">⌫</button>
              <button onClick={() => handleCalcOp("/")} className="rounded-xl bg-amber-500/20 py-3 font-black text-amber-400 text-sm hover:bg-amber-500/30">÷</button>

              {["7", "8", "9"].map((n) => (
                <button key={n} onClick={() => handleCalcNumber(n)} className="rounded-xl bg-white/5 py-3 font-black text-white text-base hover:bg-white/10">{n}</button>
              ))}
              <button onClick={() => handleCalcOp("*")} className="rounded-xl bg-amber-500/20 py-3 font-black text-amber-400 text-sm hover:bg-amber-500/30">×</button>

              {["4", "5", "6"].map((n) => (
                <button key={n} onClick={() => handleCalcNumber(n)} className="rounded-xl bg-white/5 py-3 font-black text-white text-base hover:bg-white/10">{n}</button>
              ))}
              <button onClick={() => handleCalcOp("-")} className="rounded-xl bg-amber-500/20 py-3 font-black text-amber-400 text-sm hover:bg-amber-500/30">−</button>

              {["1", "2", "3"].map((n) => (
                <button key={n} onClick={() => handleCalcNumber(n)} className="rounded-xl bg-white/5 py-3 font-black text-white text-base hover:bg-white/10">{n}</button>
              ))}
              <button onClick={() => handleCalcOp("+")} className="rounded-xl bg-amber-500/20 py-3 font-black text-amber-400 text-sm hover:bg-amber-500/30">+</button>

              <button onClick={() => handleCalcNumber("0")} className="rounded-xl bg-white/5 py-3 font-black text-white text-base hover:bg-white/10">0</button>
              <button onClick={() => handleCalcNumber("00")} className="rounded-xl bg-white/5 py-3 font-black text-white text-base hover:bg-white/10">00</button>
              <button onClick={() => !calcDisplay.includes(".") && setCalcDisplay(calcDisplay + ".")} className="rounded-xl bg-white/5 py-3 font-black text-white text-base hover:bg-white/10">.</button>
              <button onClick={handleCalcEquals} className="rounded-xl bg-amber-500 py-3 font-black text-slate-950 text-base hover:bg-amber-400">=</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========== CLOSING DAY MODAL ========== */}
      {showCloseDayModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-white/15 p-6 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-black text-white">Closing Day & Shift Settlement</h2>
                <p className="text-xs text-slate-400">Date: {dailySummary?.date || new Date().toLocaleDateString()}</p>
              </div>
              <button onClick={() => setShowCloseDayModal(false)} className="rounded-full bg-white/10 p-1.5 text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {closedSummaryRecord ? (
              <div className="space-y-4">
                <div className="rounded-2xl bg-emerald-500/20 border border-emerald-500/40 p-4 text-center">
                  <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-400" />
                  <h3 className="text-lg font-black text-emerald-300">Day Successfully Closed!</h3>
                  <p className="text-xs text-slate-300 mt-1">Audit report has been saved to the day closures ledger.</p>
                </div>

                <div className="rounded-2xl bg-white/5 p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cash Received:</span>
                    <span className="font-bold text-emerald-400">{formatCurrency(closedSummaryRecord.cash_received)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">MoMo Received:</span>
                    <span className="font-bold text-sky-400">{formatCurrency(closedSummaryRecord.momo_received)}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/10 pb-2">
                    <span className="text-slate-400">Card Payments:</span>
                    <span className="font-bold text-purple-400">{formatCurrency(closedSummaryRecord.card_received)}</span>
                  </div>
                  <div className="flex justify-between pt-2 font-black text-base">
                    <span className="text-white">Bar & Kitchen Total:</span>
                    <span className="text-amber-400 text-lg">{formatCurrency(closedSummaryRecord.total_sales)}</span>
                  </div>
                  <div className="flex justify-between text-slate-300 text-xs pt-2 border-t border-white/10 mt-2">
                    <span>Expenses:</span>
                    <span>{formatCurrency(closedSummaryRecord.total_expenses)}</span>
                  </div>
                  <div className="flex justify-between text-amber-200 text-xs font-bold">
                    <span>Net Profit:</span>
                    <span>{formatCurrency(closedSummaryRecord.net_profit)}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => window.print()} className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-3.5 font-bold text-white hover:bg-white/20">
                    <Printer size={16} /> Print Audit Sheet
                  </button>
                  <button onClick={() => { setShowCloseDayModal(false); setClosedSummaryRecord(null); }} className="flex-1 rounded-2xl bg-amber-500 py-3.5 font-black text-slate-950 hover:bg-amber-400">
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Revenue breakdown grid — Bar & Kitchen only, Room is separate system */}
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 mb-3">
                  <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                    📊 Bar & Kitchen Cash Register Only
                  </p>
                  <p className="text-[10px] text-amber-200 font-semibold mt-1">
                    ✓ Rooms payment tracked separately | ✓ Only direct bar/kitchen sales counted
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Cash</p>
                    <p className="text-lg font-black text-emerald-400 mt-1">{formatCurrency(dailySummary?.cashReceived || 0)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">MoMo</p>
                    <p className="text-lg font-black text-sky-400 mt-1">{formatCurrency(dailySummary?.momoReceived || 0)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Card</p>
                    <p className="text-lg font-black text-purple-400 mt-1">{formatCurrency(dailySummary?.cardReceived || 0)}</p>
                  </div>
                </div>

                {/* Grand Total */}
                <div className="rounded-2xl bg-gradient-to-r from-amber-950/60 to-slate-950 border border-amber-500/30 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-300">Bar & Food Total</p>
                    <p className="text-3xl font-black text-amber-400 mt-1">
                      {formatCurrency(dailySummary?.totalSales || 0)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-300 font-bold">{dailySummary?.salesCount || 0}</p>
                    <p className="text-xs text-slate-500 font-medium">Transactions</p>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
                    Shift / Closure Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter any shift notes, cash count variances, or hand-over comments..."
                    className="w-full rounded-xl bg-white/10 border border-white/10 p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500 resize-none"
                    value={closureNotes}
                    onChange={(e) => setClosureNotes(e.target.value)}
                  />
                </div>

                <button
                  onClick={handleFinalizeCloseDay}
                  disabled={closingDayLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-amber-500 py-4 font-black text-slate-950 hover:bg-amber-400 transition shadow-xl shadow-amber-500/20 disabled:opacity-50"
                >
                  {closingDayLoading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      Finalize & Reconcile Day
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ========== HELD ORDERS MODAL ========== */}
      {showTabsModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-white/10 p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-white">Held Order Tabs</h2>
              <button onClick={() => setShowTabsModal(false)} className="rounded-full bg-white/10 p-1.5 text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            {openTabs.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No active held tabs</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {openTabs.map((tab) => (
                  <div
                    key={tab.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3.5 transition hover:border-amber-500/50 hover:bg-white/10"
                  >
                    <div>
                      <p className="text-sm font-black text-white">{tab.tab_name}</p>
                      <p className="text-xs text-slate-400">
                        {Array.isArray(tab.cart_items) ? tab.cart_items.length : 0} items •{" "}
                        {new Date(tab.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-sm font-black text-amber-400">{formatCurrency(tab.total)}</span>
                      <button
                        onClick={() => resumeTab(tab)}
                        className="rounded-xl bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-950 transition hover:bg-amber-400"
                      >
                        Continue / Add items
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {showOpenRegister && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-5"><h2 className="text-lg font-black text-white">Start your cashier shift</h2><p className="mt-1 text-xs text-slate-400">Enter the cash amount currently in the drawer. This opening amount is required before selling and makes the close-day report accurate.</p></div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Opening cash amount</label>
            <input autoFocus type="number" min="0" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} placeholder="0" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-lg font-black text-white outline-none focus:border-amber-400" />
            <button disabled={openingRegister} onClick={() => void handleOpenRegister()} className="mt-5 w-full rounded-2xl bg-emerald-500 py-3 text-sm font-black text-slate-950 disabled:opacity-60">{openingRegister ? "Opening register..." : "Open register"}</button>
          </div>
        </div>, document.body
      )}

      {showGuestOrders && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-black text-white">Customer QR orders</h2><p className="text-xs text-slate-400">Accepting creates a held tab; the cashier settles it later.</p></div><button onClick={() => setShowGuestOrders(false)} className="rounded-full bg-white/10 p-2 text-slate-300"><X size={17}/></button></div>
            {pendingGuestOrders.length === 0 ? <div className="py-10 text-center text-sm text-slate-500">No customer orders waiting.</div> : <div className="max-h-[60vh] space-y-3 overflow-y-auto">{pendingGuestOrders.map((order) => <div key={order.id} className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex justify-between gap-3"><div><p className="font-black text-white">{order.guest_name}</p><p className="text-xs text-slate-400">{order.guest_phone || "No phone"} · {new Date(order.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</p></div><p className="font-black text-amber-400">{formatCurrency(order.total)}</p></div><div className="my-3 space-y-1 border-y border-white/10 py-2">{(order.items || []).map((item: any, index: number) => <p key={index} className="text-xs text-slate-300">{item.quantity}× {item.name}</p>)}</div><div className="grid grid-cols-2 gap-2"><button disabled={reviewingGuestOrder === order.id} onClick={() => void reviewGuestOrder(order, false)} className="rounded-xl bg-rose-500/15 py-2 text-xs font-black text-rose-300 hover:bg-rose-500/25 disabled:opacity-50">Reject</button><button disabled={reviewingGuestOrder === order.id} onClick={() => void reviewGuestOrder(order, true)} className="rounded-xl bg-emerald-500 py-2 text-xs font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-50">{reviewingGuestOrder === order.id ? "Saving…" : "Accept order"}</button></div></div>)}</div>}
          </div>
        </div>, document.body
      )}
    </div>
  );
}
