import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Search, Plus, Minus, Trash2, Receipt, LogOut, LayoutDashboard,
  Calculator, Clock3, X, ShoppingCart, BedDouble, Utensils,
  Printer, ChevronDown, Percent, User, CreditCard, Smartphone, Wallet,
  History, CheckCircle2, AlertTriangle, RefreshCw, Bell, Table2,
  Beer, Wine, CupSoda, Coffee, Package, Check, ArrowLeft,
  DollarSign, FileText, Lock
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

import { supabase } from "../lib/supabase";

import { printerService, type HospitalityPrinterSettings, DEFAULT_PRINTER_SETTINGS } from "../services/printerService";
import { KitchenOrderTicket } from "../components/print/KitchenOrderTicket";
import { BarReceipt } from "../components/print/BarReceipt";

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

type CompletedSaleReceipt = {
  saleNumber: string;
  destination: string;
  createdAt: string;
  cashierName: string;
  customerName?: string;
  allItems: CartItem[];
  foodItems: CartItem[];
  drinkItems: CartItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: string;
  amountPaid: number;
  change: number;
};

const DRAFT_STORAGE_PREFIX = "bar_pos_draft_";

// Synthesizes a crisp, pleasant POS blip when adding an item to the cart
function playAddToCartSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Crisp blip: 560Hz -> 920Hz in 90ms
    osc.frequency.setValueAtTime(560, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(920, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);

    setTimeout(() => {
      try {
        void ctx.close();
      } catch {}
    }, 250);
  } catch {}
}

// High-volume, 3-second attention-grabbing alert chime for incoming orders
function playIncomingOrderAlert() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    // Loud repeating service bell chime across 3.0 seconds
    // 4 bursts at 0s, 0.75s, 1.5s, 2.25s
    const bursts = [0, 0.75, 1.5, 2.25];
    bursts.forEach((offset) => {
      const startTime = ctx.currentTime + offset;

      // Resonant harmonic bell pair: 880Hz (A5) + 1318.5Hz (E6)
      [880, 1318.5].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, startTime);

        // High volume
        gain.gain.setValueAtTime(0.85, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.65);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.65);
      });
    });

    setTimeout(() => {
      try {
        void ctx.close();
      } catch {}
    }, 3300);
  } catch (err) {
    console.warn("Audio alert error:", err);
  }
}

function getCategoryIcon(cat?: string | null) {
  const c = (cat || "").toLowerCase();
  if (c.includes("beer")) return <Beer className="h-6 w-6 text-brand-600" />;
  if (c.includes("wine") || c.includes("spirit") || c.includes("liquor") || c.includes("whisky") || c.includes("vodka")) {
    return <Wine className="h-6 w-6 text-brand-600" />;
  }
  if (c.includes("drink") || c.includes("water") || c.includes("juice") || c.includes("soda") || c.includes("soft")) {
    return <CupSoda className="h-6 w-6 text-brand-600" />;
  }
  if (c.includes("coffee") || c.includes("tea")) return <Coffee className="h-6 w-6 text-brand-600" />;
  if (c.includes("food") || c.includes("kitchen") || c.includes("snack") || c.includes("chicken") || c.includes("meal")) {
    return <Utensils className="h-6 w-6 text-brand-600" />;
  }
  return <Package className="h-6 w-6 text-slate-400" />;
}

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
  const isInitialQrLoad = useRef(true);

  // Restore unsaved cart from local storage on first load
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
      showToast("error", "Failed to load bar inventory and station data");
    } finally {
      setLoading(false);
    }
  }, [businessId, profile?.location_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadPendingGuestOrders = useCallback(async () => {
    if (!businessId) return;
    try {
      const orders = await guestOrderService.listPending(businessId);
      if (isInitialQrLoad.current) {
        isInitialQrLoad.current = false;
        previousPendingQrCount.current = orders.length;
      } else if (orders.length > previousPendingQrCount.current) {
        playIncomingOrderAlert();
        showToast("info", "🔔 New QR order received from customer! Please check incoming orders.");
        previousPendingQrCount.current = orders.length;
      } else {
        previousPendingQrCount.current = orders.length;
      }
      setPendingGuestOrders(orders);
    } catch {}
  }, [businessId, showToast]);

  useEffect(() => {
    void loadPendingGuestOrders();
    const interval = window.setInterval(() => void loadPendingGuestOrders(), 5000);

    const channel = supabase
      .channel(`bar_pos_guest_orders_${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "guest_orders",
        },
        () => {
          void loadPendingGuestOrders();
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [loadPendingGuestOrders, businessId]);

  const reviewGuestOrder = async (order: GuestOrder, accepted: boolean) => {
    if (!profile?.id) return;
    setReviewingGuestOrder(order.id);
    try {
      await guestOrderService.review(order.id, profile.id, accepted);
      setPendingGuestOrders((orders) => {
        const remaining = orders.filter((item) => item.id !== order.id);
        previousPendingQrCount.current = remaining.length;
        return remaining;
      });
      showToast("success", accepted ? "Customer order accepted as a held tab." : "Customer order rejected.");
      if (accepted) {
        await loadData();
        setShowTabsModal(true);
      }
    } catch (error: any) {
      showToast("error", error.message || "Could not review customer order");
    } finally {
      setReviewingGuestOrder(null);
    }
  };

  const getOrderTargetBadge = (order: GuestOrder) => {
    if (order.table?.table_number) {
      return { type: "table" as const, label: `Table ${order.table.table_number}` };
    }
    if (order.room?.room_number) {
      return { type: "room" as const, label: `Room ${order.room.room_number}` };
    }
    if (order.table_id) {
      const t = tables.find((x) => x.id === order.table_id);
      if (t) return { type: "table" as const, label: `Table ${t.table_number}` };
    }
    if (order.room_id) {
      const b = activeBookings.find((x) => x.room_id === order.room_id);
      if (b && (b as any).rooms?.room_number) {
        return { type: "room" as const, label: `Room ${(b as any).rooms.room_number}` };
      }
    }
    return null;
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

  // Deduplicated active room bookings: strictly 1 guest per occupied room (the latest active booking)
  const validActiveRoomBookings = useMemo(() => {
    const roomMap = new Map<string, RoomBookingRecord>();
    for (const b of activeBookings) {
      // Room must exist and be occupied or reserved
      const roomStatus = (b as any).room?.status;
      if (roomStatus === "available" || roomStatus === "cleaning" || roomStatus === "maintenance") {
        continue;
      }
      if (b.status !== "checked_in" && b.status !== "reserved") {
        continue;
      }
      const roomId = b.room_id || (b as any).room?.id;
      if (!roomId) continue;
      // Since listActiveBookings is ordered by check_in DESC, first one encountered is the latest
      if (!roomMap.has(roomId)) {
        roomMap.set(roomId, b);
      }
    }
    return Array.from(roomMap.values());
  }, [activeBookings]);

  // Real-time available stock calculator for a product taking current cart into account
  const getAvailableStock = useCallback(
    (product: ProductRecord) => {
      const cartItem = cart.find((i) => i.product_id === product.id);
      const cartQty = cartItem ? cartItem.quantity : 0;
      const baseStock = product.stock_quantity ?? 0;
      return baseStock - cartQty;
    },
    [cart]
  );

  const addToCart = (product: ProductRecord) => {
    playAddToCartSound();
    // Allows selling even if inventory is 0 or negative
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
    if (delta > 0) {
      playAddToCartSound();
    }
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
      showToast("error", "Please select a Table, Room, or Customer before holding the order.");
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
      setOpenTabs((prev) => prev.map((t) => (t.id === resumedTabId ? optimisticTab : t)));
    } else {
      setOpenTabs((prev) => [optimisticTab, ...prev]);
    }

    showToast("success", `Order placed on hold: "${tabName}"`);

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

    tableService
      .saveOrHoldTab({
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
      })
      .then((savedTab) => {
        setOpenTabs((prev) =>
          prev.map((t) => (t.id === localTabId ? { ...optimisticTab, id: savedTab.id } : t))
        );
        if (snapTable) {
          tableService.updateTableStatus(snapTable.id, "occupied").catch(() => {});
        }
      })
      .catch(() => {});
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

  // Pay Now
  const handlePayNow = async () => {
    if (cart.length === 0) return;
    if (paymentMethod !== "room_folio" && (!amountPaid || parseFloat(amountPaid) < total)) {
      showToast("error", "Amount paid must be greater than or equal to total amount.");
      return;
    }

    // STRICT GUARD: Cashier cannot sell/charge to an empty or non-occupied room!
    if (paymentMethod === "room_folio") {
      if (!selectedRoom) {
        showToast("error", "Cannot charge to room: Please select an active guest room folio.");
        return;
      }
      const roomStatus = (selectedRoom as any).room?.status;
      if (roomStatus === "available" || roomStatus === "cleaning" || roomStatus === "maintenance") {
        showToast(
          "error",
          `Charging forbidden: Room ${(selectedRoom as any).room?.room_number || ""} is currently ${roomStatus}. Cashiers cannot sell to an empty room!`
        );
        return;
      }
      if (selectedRoom.status !== "checked_in" && selectedRoom.status !== "reserved") {
        showToast("error", "This room booking is no longer active. Charge aborted.");
        return;
      }
    }
    setProcessing(true);
    try {
      const isRoomFolio = paymentMethod === "room_folio";

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
        payment_method: isRoomFolio ? "credit" : (paymentMethod as PaymentMethod),
        payment_status: isRoomFolio ? "unpaid" : "paid",
        subtotal,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        discount_type: discountAmount > 0 ? "fixed" : null,
        total_amount: total,
        notes: saleNotes,
      });

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

      if (resumedTabId) {
        setOpenTabs((prev) => prev.filter((t) => t.id !== resumedTabId));
        tableService.closeTab(resumedTabId, selectedTable?.id).catch(() => {});
      } else if (selectedTable) {
        tableService.updateTableStatus(selectedTable.id, "available").catch(() => {});
      }

      showToast("success", `Sale completed. [${saleNotes}] Total: ${formatCurrency(total)}`);
      setShowPayModal(false);
      clearCart();
    } catch (err: any) {
      showToast("error", err.message || "Failed to process sale");
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

  // Open Close Day Modal — Strictly blocked if any held tabs are unsettled
  const handleOpenCloseDay = async () => {
    if (!activeRegister) {
      setShowOpenRegister(true);
      return;
    }
    if (openTabs && openTabs.length > 0) {
      showToast(
        "error",
        `Shift closure blocked: You have ${openTabs.length} open held tab(s) not yet settled. Settle or cancel all held tabs before closing the day.`
      );
      setShowTabsModal(true);
      return;
    }
    try {
      const summary = await dayCloseService.getDailySummary(businessId);
      setDailySummary(summary);
      setShowCloseDayModal(true);
    } catch (err) {
      showToast("error", "Failed to load register shift summary");
    }
  };

  const handleOpenRegister = async () => {
    if (!profile?.id || !businessId) return;
    const cashVal = parseFloat(openingCash);
    if (openingCash.trim() === "" || isNaN(cashVal) || cashVal < 0) {
      showToast("error", "Please provide a valid starting cash float (0 or greater).");
      return;
    }
    setOpeningRegister(true);
    try {
      const register = await dayCloseService.openRegister({
        business_id: businessId,
        user_id: profile.id,
        location_id: profile.location_id,
        opening_cash: cashVal,
      });
      setActiveRegister(register);
      setOpeningCash("");
      setShowOpenRegister(false);
      showToast("success", "Cash register opened for this shift.");
    } catch (error: any) {
      showToast("error", error.message || "Could not open register");
    } finally {
      setOpeningRegister(false);
    }
  };

  // Finalize Close Day
  const handleFinalizeCloseDay = async () => {
    if (!dailySummary) return;
    if (openTabs && openTabs.length > 0) {
      showToast(
        "error",
        `Cannot close shift: You have ${openTabs.length} open held tab(s). Settle all active tabs first.`
      );
      return;
    }
    const ok = await confirm(
      "Confirm Shift Closure",
      "Are you sure you want to finalize this register shift and reconcile today's sales?"
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
        room_revenue: 0,
        total_expenses: dailySummary.totalExpenses,
        net_profit: dailySummary.netProfit,
        notes: closureNotes,
      });

      setClosedSummaryRecord(saved);
      setActiveRegister(null);
      showToast("success", "Register shift closed and reconciled. Returning to dashboard...");
      setTimeout(() => {
        navigate("/dashboard");
      }, 1500);
    } catch (err: any) {
      showToast("error", err.message || "Failed to close register shift");
    } finally {
      setClosingDayLoading(false);
    }
  };

  const setQuickTender = (val: number) => {
    setAmountPaid(val.toString());
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center text-slate-800">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          <p className="font-bold text-base text-slate-800">Loading Station & Catalog...</p>
          <p className="text-xs text-slate-500 mt-1">Connecting to products, tables and room folios</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-900 select-none font-sans">
      {/* ========== LEFT: PRODUCTS (60%) ========== */}
      <div className="flex w-[55%] flex-col border-r border-slate-200 bg-slate-100">
        {/* Top bar — System Brand Blue */}
        <header className="flex items-center justify-between px-5 py-3 bg-brand-600 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 hover:bg-brand-800 text-white transition border border-brand-500/40"
              title="Return to Dashboard"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-white tracking-tight">
                  {settings?.shop_name || "Bar & Beverage Station"}
                </span>
                {activeRegister ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/15 text-white border border-white/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse"></span>
                    Register Open
                  </span>
                ) : (
                  <button
                    onClick={() => setShowOpenRegister(true)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 transition"
                  >
                    <Lock size={11} />
                    Open Register
                  </button>
                )}
              </div>
              <p className="text-[11px] text-brand-100 font-medium">
                Cashier: {profile?.full_name || profile?.email || "Staff"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowGuestOrders(true);
                void loadPendingGuestOrders();
              }}
              className="relative flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 hover:bg-brand-800 px-3 text-xs font-bold text-white transition border border-brand-500/30"
              title="Customer QR orders"
            >
              <Bell size={15} />
              <span>Orders</span>
              {pendingGuestOrders.length > 0 && (
                <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
                  {pendingGuestOrders.length}
                </span>
              )}
            </button>

            <button
              onClick={handleOpenCloseDay}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 hover:bg-brand-800 px-3 text-xs font-bold text-white transition border border-brand-500/30"
              title="Close shift and balance register"
            >
              <Receipt size={15} />
              <span>Shift Closure</span>
            </button>

            <button
              onClick={() => setShowCalc(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 hover:bg-brand-800 text-white transition border border-brand-500/30"
              title="Calculator"
            >
              <Calculator size={15} />
            </button>

            <button
              onClick={() => loadData()}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 hover:bg-brand-800 text-white transition border border-brand-500/30"
              title="Refresh catalog"
            >
              <RefreshCw size={14} />
            </button>

            <button
              onClick={() => logout()}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition border border-rose-500"
              title="Sign Out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>

        {/* Search Bar */}
        <div className="px-5 py-3 border-b border-slate-200 bg-white">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search drinks, dishes, brands, barcode..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 transition font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex gap-1.5 overflow-x-auto px-5 py-2.5 border-b border-slate-200 bg-white/80 scrollbar-none">
          {categories.map((cat) => {
            const isActive = selectedCategory.toLowerCase() === cat.toLowerCase();
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-bold transition ${
                  isActive
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Product Grid — Comfortable, Wider Cards with Real-Time Stock (Allows Negative Selling) */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-100/70">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const availableStock = getAvailableStock(product);
              const isLow = availableStock > 0 && availableStock <= (product.reorder_level || 5);
              const cartItem = cart.find((i) => i.product_id === product.id);

              return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className={`group relative flex flex-col text-left rounded-xl border bg-white transition-all active:scale-[0.97] overflow-hidden shadow-xs hover:shadow-md ${
                    cartItem
                      ? "border-brand-500 ring-1 ring-brand-400"
                      : "border-slate-200 hover:border-brand-400"
                  }`}
                >
                  {/* Badge: Cart Quantity */}
                  {cartItem && cartItem.quantity > 0 && (
                    <span className="absolute top-1.5 right-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-black text-white shadow-xs">
                      {cartItem.quantity}
                    </span>
                  )}

                  {product.image_url ? (
                    <div className="h-24 w-full overflow-hidden bg-slate-50 border-b border-slate-100 shrink-0">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-full w-full object-cover group-hover:scale-105 transition duration-150"
                      />
                    </div>
                  ) : (
                    <div className="flex h-20 w-full items-center justify-center bg-slate-50 border-b border-slate-100 shrink-0">
                      {getCategoryIcon((product as any).category)}
                    </div>
                  )}

                  <div className="p-2.5 flex-1 flex flex-col justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight">
                        {product.name}
                      </p>
                      <p className="mt-1 text-xs font-black text-brand-600">
                        {formatCurrency(product.selling_price)}
                      </p>
                    </div>

                    <div className="mt-2 flex items-center justify-between pt-1 border-t border-slate-100 text-[10px]">
                      <span
                        className={`font-black px-1.5 py-0.5 rounded-md ${
                          availableStock < 0
                            ? "bg-rose-100 text-rose-800 font-black"
                            : availableStock === 0
                            ? "bg-amber-100 text-amber-800 font-black"
                            : isLow
                            ? "bg-amber-50 text-amber-700 font-bold"
                            : "bg-emerald-50 text-emerald-700 font-bold"
                        }`}
                      >
                        Stock: {availableStock}
                      </span>
                      {cartItem && (
                        <span className="text-[9px] font-bold text-brand-600">In Cart</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {filteredProducts.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-400">
                <ShoppingCart size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-bold text-slate-600">No products found</p>
                <p className="text-xs text-slate-400 mt-0.5">Try searching with a different term</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========== RIGHT: ORDER / CART (40%) — DARK CARD (SUPERMARKET POS STYLE) ========== */}
      <div className="flex w-[45%] flex-col bg-slate-950 text-white border-l border-slate-800 p-2 shadow-2xl">
        <div className="flex flex-col h-full rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
          {/* Order Destination / Context Selection (Dark Header) */}
          <div className="border-b border-slate-800 p-2.5 bg-slate-900 space-y-2">
            <div className="grid grid-cols-3 gap-2.5">
              {/* Table */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                  <Table2 size={11} className="text-slate-400" /> Table
                </label>
                <select
                  value={selectedTable?.id || ""}
                  onChange={(e) => setSelectedTable(tables.find((t) => t.id === e.target.value) || null)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs font-semibold text-white outline-none focus:border-brand-500"
                >
                  <option value="">No Table</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      Table {t.table_number} {t.status === "occupied" ? "(Occupied)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Customer */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                  <User size={11} className="text-slate-400" /> Customer
                </label>
                <select
                  value={selectedCustomer?.id || ""}
                  onChange={(e) => setSelectedCustomer(customers.find((c) => c.id === e.target.value) || null)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs font-semibold text-white outline-none focus:border-brand-500"
                >
                  <option value="">Walk-in</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Room Folio: Strictly Occupied / Reserved Rooms with Deduplicated Guest */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-sky-400 mb-1 flex items-center gap-1">
                  <BedDouble size={11} className="text-sky-400" /> Room Folio
                </label>
                <select
                  value={selectedRoom?.id || ""}
                  onChange={(e) => {
                    const b = validActiveRoomBookings.find((bk) => bk.id === e.target.value) || null;
                    setSelectedRoom(b);
                    if (b) setPaymentMethod("room_folio");
                  }}
                  className="w-full rounded-lg bg-slate-950 border border-sky-600/40 px-2 py-1.5 text-xs font-bold text-sky-300 outline-none focus:border-sky-500"
                >
                  <option value="">No Room</option>
                  {validActiveRoomBookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      Room {(b as any).room?.room_number} – {b.guest_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Active Context Alerts */}
            {(selectedRoom || resumedTabId) && (
              <div className="flex items-center justify-between rounded-lg bg-sky-950/70 border border-sky-800/60 px-3 py-1.5 text-xs">
                <div className="flex items-center gap-2 font-bold text-sky-300">
                  {selectedRoom ? (
                    <>
                      <BedDouble size={13} className="text-sky-400 shrink-0" />
                      <span>Charging Room {(selectedRoom as any).room?.room_number} ({selectedRoom.guest_name})</span>
                    </>
                  ) : (
                    <>
                      <Clock3 size={13} className="text-sky-400 shrink-0" />
                      <span>Resumed tab in progress</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (selectedRoom) setSelectedRoom(null);
                    if (resumedTabId) setResumedTabId(null);
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Cart Item Rows (Dark Theme) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-950/60">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-slate-500 py-12">
                <ShoppingCart size={34} className="mb-2 text-slate-700" />
                <p className="text-xs font-bold text-slate-400">Order is empty</p>
                <p className="text-[11px] text-slate-600 mt-0.5">Tap products on the left to add items</p>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product_id}
                  className="flex items-center justify-between gap-2.5 rounded-xl bg-slate-900 border border-slate-800 p-2.5 hover:border-slate-700 transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{item.name}</p>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                      {formatCurrency(item.unit_price)} each
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center border border-slate-700 rounded-lg bg-slate-950 overflow-hidden">
                      <button
                        onClick={() => updateQty(item.product_id, -1)}
                        className="flex h-6 w-6 items-center justify-center text-slate-300 hover:bg-slate-800 transition"
                      >
                        <Minus size={11} />
                      </button>
                      <span className="w-6 text-center text-xs font-black text-white">{item.quantity}</span>
                      <button
                        onClick={() => updateQty(item.product_id, 1)}
                        className="flex h-6 w-6 items-center justify-center text-slate-300 hover:bg-slate-800 transition"
                      >
                        <Plus size={11} />
                      </button>
                    </div>

                    <span className="text-xs font-black text-emerald-400 w-16 text-right">
                      {formatCurrency(item.line_total)}
                    </span>

                    <button
                      onClick={() => removeFromCart(item.product_id)}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-rose-950 hover:text-rose-400 transition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Bill Summary Calculations (Dark Theme) */}
          <div className="border-t border-slate-800 bg-slate-900 px-4 py-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-400 font-medium">
              <span>Subtotal</span>
              <span className="text-white font-bold">{formatCurrency(subtotal)}</span>
            </div>

            {taxAmount > 0 && (
              <div className="flex items-center justify-between text-slate-400 font-medium">
                <span>Tax ({taxRate}%)</span>
                <span className="text-white font-bold">{formatCurrency(taxAmount)}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-slate-400 font-medium">
              <div className="flex items-center gap-1.5">
                <span>Discount</span>
                <div className="flex items-center border border-slate-700 rounded bg-slate-950 px-1.5 py-0.5">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={discount || ""}
                    onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                    className="w-7 bg-transparent text-center text-white outline-none text-xs font-bold"
                    placeholder="0"
                  />
                  <span className="text-[10px] text-slate-500">%</span>
                </div>
              </div>
              <span className={discountAmount > 0 ? "text-rose-400 font-bold" : "text-white font-bold"}>
                -{formatCurrency(discountAmount)}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-base font-black">
              <span className="text-slate-200">Total Payable</span>
              <span className="text-emerald-400 text-lg font-black">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Cart Action Buttons (Dark Theme) */}
          <div className="grid grid-cols-4 gap-2 p-2.5 border-t border-slate-800 bg-slate-950">
            <button
              onClick={() => setShowTabsModal(true)}
              className="flex items-center justify-center gap-1 rounded-xl border border-slate-800 bg-slate-900 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition shadow-xs"
              title="View held tabs"
            >
              <Clock3 size={13} />
              <span>Tabs ({openTabs.length})</span>
            </button>

            <button
              onClick={holdOrder}
              disabled={cart.length === 0}
              className="flex items-center justify-center gap-1 rounded-xl border border-slate-800 bg-slate-900 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition disabled:opacity-30 shadow-xs"
              title="Hold current order"
            >
              <History size={13} />
              <span>Hold Tab</span>
            </button>

            <button
              onClick={clearCart}
              disabled={cart.length === 0}
              className="flex items-center justify-center gap-1 rounded-xl border border-rose-900/60 bg-rose-950/40 py-2.5 text-xs font-bold text-rose-400 hover:bg-rose-900/60 hover:text-rose-200 transition disabled:opacity-30 shadow-xs"
              title="Clear cart"
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>

            <button
              onClick={() => {
                setAmountPaid(total.toString());
                setShowPayModal(true);
              }}
              disabled={cart.length === 0}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white hover:bg-emerald-500 shadow-md transition disabled:opacity-30 active:scale-[0.98]"
            >
              <Receipt size={14} />
              <span>Pay</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========== PAYMENT MODAL (WHITE & VISIBLE) ========== */}
      {showPayModal &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <h2 className="text-base font-black text-slate-900">Payment & Settlement</h2>
                <button
                  onClick={() => setShowPayModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Total Due Banner */}
              <div className="mb-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Amount Due</span>
                <p className="text-3xl font-black text-brand-600 mt-0.5">{formatCurrency(total)}</p>
                {selectedRoom && (
                  <p className="mt-1 text-xs text-brand-700 font-bold">
                    Charging to Room {(selectedRoom as any).room?.room_number} ({selectedRoom.guest_name})
                  </p>
                )}
              </div>

              {/* Payment Method Selector */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-700 mb-2">Select Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { method: "cash" as const, label: "Cash", icon: Wallet },
                      { method: "momo" as const, label: "Mobile Money", icon: Smartphone },
                      { method: "card" as const, label: "Credit/Debit Card", icon: CreditCard },
                      { method: "room_folio" as const, label: "Room Folio", icon: BedDouble },
                    ] as const
                  ).map(({ method, label, icon: Icon }) => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`flex items-center gap-2.5 rounded-lg p-2.5 text-xs font-bold border transition ${
                        paymentMethod === method
                          ? "border-brand-600 bg-brand-50 text-brand-700 shadow-xs"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Icon size={16} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Tendered */}
              {paymentMethod !== "room_folio" && (
                <div className="mb-5 space-y-2">
                  <label className="block text-xs font-bold text-slate-700">Amount Tendered</label>
                  <input
                    type="number"
                    className="w-full rounded-lg bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-xl font-black text-slate-900 outline-none focus:border-brand-600 focus:bg-white transition"
                    placeholder="0"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    autoFocus
                  />

                  {/* Quick cash denomination chips */}
                  <div className="flex gap-1.5 flex-wrap pt-1">
                    <button
                      type="button"
                      onClick={() => setQuickTender(total)}
                      className="px-2.5 py-1 rounded bg-slate-100 text-[11px] font-bold text-slate-700 border border-slate-200 hover:bg-slate-200 transition"
                    >
                      Exact
                    </button>
                    {[1000, 2000, 5000, 10000, 20000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setQuickTender(preset)}
                        className="px-2.5 py-1 rounded bg-slate-100 text-[11px] font-bold text-slate-700 border border-slate-200 hover:bg-slate-200 transition"
                      >
                        {formatCurrency(preset)}
                      </button>
                    ))}
                  </div>

                  {change > 0 && (
                    <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 border border-emerald-200">
                      <span className="text-xs font-bold text-emerald-800">Change Due:</span>
                      <span className="text-sm font-black text-emerald-700">{formatCurrency(change)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Submit Payment */}
              <button
                onClick={handlePayNow}
                disabled={processing}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-black text-white hover:bg-brand-700 transition disabled:opacity-50 shadow-md"
              >
                {processing ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>{paymentMethod === "room_folio" ? "Charge to Room Folio" : "Complete Transaction"}</span>
                  </>
                )}
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* ========== SHIFT CLOSURE & DAY SETTLEMENT MODAL (CLEAN WHITE) ========== */}
      {showCloseDayModal &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Shift Settlement & Register Closure</h2>
                  <p className="text-xs text-slate-500 font-medium">Date: {dailySummary?.date || new Date().toLocaleDateString()}</p>
                </div>
                <button
                  onClick={() => setShowCloseDayModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                >
                  <X size={18} />
                </button>
              </div>

              {closedSummaryRecord ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
                    <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-600" />
                    <h3 className="text-base font-black text-emerald-800">Shift Reconciled & Closed</h3>
                    <p className="text-xs text-emerald-600 mt-0.5">Summary record has been saved to the closure audit log.</p>
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500 font-medium">Cash Received:</span>
                      <span className="font-bold text-slate-900">
                        {formatCurrency(closedSummaryRecord.cash_received)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500 font-medium">Mobile Money:</span>
                      <span className="font-bold text-slate-900">
                        {formatCurrency(closedSummaryRecord.momo_received)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500 font-medium">Card Payments:</span>
                      <span className="font-bold text-slate-900">
                        {formatCurrency(closedSummaryRecord.card_received)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 font-black text-sm">
                      <span className="text-slate-900">Total Gross Sales:</span>
                      <span className="text-brand-600">{formatCurrency(closedSummaryRecord.total_sales)}</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => window.print()}
                      className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
                    >
                      <Printer size={15} /> Print Audit Sheet
                    </button>
                    <button
                      onClick={() => {
                        setShowCloseDayModal(false);
                        setClosedSummaryRecord(null);
                      }}
                      className="flex-1 rounded-lg bg-brand-600 py-2.5 text-xs font-black text-white hover:bg-brand-700 transition shadow-sm"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cash</p>
                      <p className="text-base font-black text-slate-900 mt-1">
                        {formatCurrency(dailySummary?.cashReceived || 0)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mobile Money</p>
                      <p className="text-base font-black text-slate-900 mt-1">
                        {formatCurrency(dailySummary?.momoReceived || 0)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Card</p>
                      <p className="text-base font-black text-slate-900 mt-1">
                        {formatCurrency(dailySummary?.cardReceived || 0)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Shift Sales</p>
                      <p className="text-2xl font-black text-brand-600 mt-0.5">
                        {formatCurrency(dailySummary?.totalSales || 0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-900">{dailySummary?.salesCount || 0}</p>
                      <p className="text-[11px] text-slate-500 font-medium">Transactions</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Shift Notes & Cash Count Comments
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Optional shift handover notes, drawer variances or observations..."
                      className="w-full rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-brand-600 focus:bg-white resize-none"
                      value={closureNotes}
                      onChange={(e) => setClosureNotes(e.target.value)}
                    />
                  </div>

                  <button
                    onClick={handleFinalizeCloseDay}
                    disabled={closingDayLoading}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-black text-white hover:bg-brand-700 transition shadow-md disabled:opacity-50"
                  >
                    {closingDayLoading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Confirm Shift Closure & Reconcile</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* ========== HELD TABS MODAL (CLEAN WHITE & VISIBLE) ========== */}
      {showTabsModal &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <h2 className="text-base font-black text-slate-900">Held Order Tabs</h2>
                <button
                  onClick={() => setShowTabsModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                >
                  <X size={18} />
                </button>
              </div>

              {openTabs.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <Clock3 size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-bold text-slate-600">No active held tabs</p>
                  <p className="text-xs text-slate-400 mt-0.5">Orders placed on hold will appear here</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {openTabs.map((tab) => (
                    <div
                      key={tab.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200 p-3.5 transition hover:bg-slate-100 hover:border-slate-300 shadow-xs"
                    >
                      <div>
                        <p className="text-xs font-black text-slate-900">{tab.tab_name}</p>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          {Array.isArray(tab.cart_items) ? tab.cart_items.length : 0} items •{" "}
                          {new Date(tab.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs font-black text-brand-600">{formatCurrency(tab.total)}</span>
                        <button
                          onClick={() => resumeTab(tab)}
                          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-black text-white hover:bg-brand-700 transition shadow-xs"
                        >
                          Resume
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

      {/* ========== OPEN REGISTER MODAL (CLEAN WHITE) ========== */}
      {showOpenRegister &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="mb-4">
                <h2 className="text-base font-black text-slate-900">Open Cash Register</h2>
                <p className="mt-1 text-xs text-slate-500 font-medium">
                  Enter the starting cash float in the drawer to begin operations for this shift.
                </p>
              </div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Opening Cash Float</label>
              <input
                autoFocus
                type="number"
                min="0"
                value={openingCash}
                onChange={(event) => setOpeningCash(event.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-lg font-black text-slate-900 outline-none focus:border-brand-600 focus:bg-white"
              />
              <button
                disabled={openingRegister}
                onClick={() => void handleOpenRegister()}
                className="mt-4 w-full rounded-xl bg-brand-600 py-3 text-xs font-black text-white hover:bg-brand-700 disabled:opacity-60 transition shadow-sm"
              >
                {openingRegister ? "Opening register..." : "Open Register & Start Shift"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="mt-2 w-full rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 transition"
              >
                Return to Dashboard
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* ========== GUEST ORDERS MODAL (CLEAN WHITE) ========== */}
      {showGuestOrders &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-black text-slate-900">Customer QR Orders</h2>
                  <p className="text-xs text-slate-500 font-medium">Accept orders to hold them as active tabs for settlement.</p>
                </div>
                <button
                  onClick={() => setShowGuestOrders(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                >
                  <X size={18} />
                </button>
              </div>

              {pendingGuestOrders.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <Bell size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-bold text-slate-600">No customer orders waiting</p>
                </div>
              ) : (
                <div className="max-h-[60vh] space-y-3 overflow-y-auto">
                  {pendingGuestOrders.map((order) => {
                    const targetBadge = getOrderTargetBadge(order);
                    return (
                      <div key={order.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-xs space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {targetBadge ? (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-xs font-black uppercase tracking-wider ${
                                    targetBadge.type === "room"
                                      ? "bg-violet-100 text-violet-800 border border-violet-200"
                                      : "bg-indigo-100 text-indigo-800 border border-indigo-200"
                                  }`}
                                >
                                  {targetBadge.type === "room" ? <BedDouble size={13} /> : <Utensils size={13} />}
                                  {targetBadge.label}
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-lg bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                                  Customer QR
                                </span>
                              )}
                              <p className="font-bold text-xs text-slate-900">{order.guest_name}</p>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium">
                              {order.guest_phone || "No phone"} ·{" "}
                              {new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          <p className="font-black text-sm text-brand-600">{formatCurrency(order.total)}</p>
                        </div>

                        <div className="my-2 rounded-xl border border-slate-200 bg-white p-2.5 space-y-1">
                          {(order.items || []).map((item: any, index: number) => (
                            <div key={index} className="flex justify-between text-xs font-semibold text-slate-700">
                              <span>{item.quantity}× {item.name}</span>
                              <span className="text-slate-400 font-medium">
                                {item.line_total ? formatCurrency(item.line_total) : ""}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-0.5">
                          <button
                            disabled={reviewingGuestOrder === order.id}
                            onClick={() => void reviewGuestOrder(order, false)}
                            className="rounded-xl bg-rose-50 border border-rose-200 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition"
                          >
                            Reject
                          </button>
                          <button
                            disabled={reviewingGuestOrder === order.id}
                            onClick={() => void reviewGuestOrder(order, true)}
                            className="rounded-xl bg-brand-600 py-2.5 text-xs font-black text-white hover:bg-brand-700 disabled:opacity-50 transition shadow-xs"
                          >
                            {reviewingGuestOrder === order.id ? "Processing..." : "Accept Order"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* ========== WORKING CALCULATOR MODAL (CLEAN WHITE) ========== */}
      {showCalc &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-xs rounded-2xl bg-white border border-slate-200 p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calculator size={16} className="text-brand-600" />
                  <h3 className="font-bold text-xs text-slate-900">Calculator</h3>
                </div>
                <button
                  onClick={() => setShowCalc(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Screen */}
              <div className="mb-3 rounded-lg bg-slate-100 border border-slate-200 p-3 text-right">
                <p className="text-[11px] text-slate-500 font-mono h-4">{calcEquation || " "}</p>
                <p className="text-xl font-black text-slate-900 font-mono truncate">{calcDisplay}</p>
              </div>

              {/* Keys */}
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  onClick={handleCalcClear}
                  className="col-span-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 py-2.5 font-bold text-xs hover:bg-rose-100 transition"
                >
                  C
                </button>
                <button
                  onClick={() => setCalcDisplay(calcDisplay.length > 1 ? calcDisplay.slice(0, -1) : "0")}
                  className="rounded-lg bg-slate-100 border border-slate-200 text-slate-700 py-2.5 font-bold text-xs hover:bg-slate-200 transition"
                >
                  ⌫
                </button>
                <button
                  onClick={() => handleCalcOp("/")}
                  className="rounded-lg bg-slate-100 border border-slate-200 text-brand-600 py-2.5 font-black text-xs hover:bg-slate-200 transition"
                >
                  ÷
                </button>

                {["7", "8", "9"].map((n) => (
                  <button
                    key={n}
                    onClick={() => handleCalcNumber(n)}
                    className="rounded-lg bg-slate-50 border border-slate-200 text-slate-900 py-2.5 font-bold text-xs hover:bg-slate-100 transition shadow-xs"
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => handleCalcOp("*")}
                  className="rounded-lg bg-slate-100 border border-slate-200 text-brand-600 py-2.5 font-black text-xs hover:bg-slate-200 transition"
                >
                  ×
                </button>

                {["4", "5", "6"].map((n) => (
                  <button
                    key={n}
                    onClick={() => handleCalcNumber(n)}
                    className="rounded-lg bg-slate-50 border border-slate-200 text-slate-900 py-2.5 font-bold text-xs hover:bg-slate-100 transition shadow-xs"
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => handleCalcOp("-")}
                  className="rounded-lg bg-slate-100 border border-slate-200 text-brand-600 py-2.5 font-black text-xs hover:bg-slate-200 transition"
                >
                  −
                </button>

                {["1", "2", "3"].map((n) => (
                  <button
                    key={n}
                    onClick={() => handleCalcNumber(n)}
                    className="rounded-lg bg-slate-50 border border-slate-200 text-slate-900 py-2.5 font-bold text-xs hover:bg-slate-100 transition shadow-xs"
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => handleCalcOp("+")}
                  className="rounded-lg bg-slate-100 border border-slate-200 text-brand-600 py-2.5 font-black text-xs hover:bg-slate-200 transition"
                >
                  +
                </button>

                <button
                  onClick={() => handleCalcNumber("0")}
                  className="rounded-lg bg-slate-50 border border-slate-200 text-slate-900 py-2.5 font-bold text-xs hover:bg-slate-100 transition shadow-xs"
                >
                  0
                </button>
                <button
                  onClick={() => handleCalcNumber("00")}
                  className="rounded-lg bg-slate-50 border border-slate-200 text-slate-900 py-2.5 font-bold text-xs hover:bg-slate-100 transition shadow-xs"
                >
                  00
                </button>
                <button
                  onClick={() => !calcDisplay.includes(".") && setCalcDisplay(calcDisplay + ".")}
                  className="rounded-lg bg-slate-50 border border-slate-200 text-slate-900 py-2.5 font-bold text-xs hover:bg-slate-100 transition shadow-xs"
                >
                  .
                </button>
                <button
                  onClick={handleCalcEquals}
                  className="rounded-lg bg-brand-600 text-white py-2.5 font-black text-xs hover:bg-brand-700 transition shadow-xs"
                >
                  =
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
