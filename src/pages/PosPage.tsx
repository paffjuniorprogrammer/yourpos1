import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Clock3,
  Calculator,
  Camera,
  LogOut,
  LayoutDashboard,
  Minus,
  Plus,
  Receipt,
  Search,
  Trash2,
  UserPlus,
  Wallet,
  X,
  MapPin,
  Tag,
  Percent,
  History,
  RotateCcw,
  ArrowLeftRight,
} from "lucide-react";
import { LoadingPOS } from "../components/ui/LoadingPOS";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabaseConfigured } from "../lib/supabase";
import {
  createDayClosure,
  createPosSale,
  getCloseDaySummary,
  getShopSettings,
  listPosCustomers,
  listPosProducts,
  checkOpenRegister,
  openRegister,
} from "../services/posService";
import { createCustomer } from "../services/customerService";
import { processReturn, type ReturnItemInput } from "../services/returnService";
import { listSales, getSaleDetails } from "../services/saleService";
import { usePosData } from "../context/PosDataContext";
import { ShoppingBag, Tablet, CreditCard } from "lucide-react";
import type { PaymentMethod, PosCustomerRecord, PosProductRecord, ShopSettingsRecord } from "../types/database";

type BulkBreakdown = {
  bulkPackages: number;
  bulkQty: number;
  bulkPrice: number;
  remainingUnits: number;
  unitPrice: number;
  lineTotal: number;
};

type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  discount_type: 'percentage' | 'fixed' | null;
  discount_value: number;
  bulkBreakdown?: BulkBreakdown;
};

/** Compute bulk pricing breakdown for a given quantity */
function computeBulkBreakdown(
  qty: number,
  unitPrice: number,
  bulkQty: number | null,
  bulkPrice: number | null
): BulkBreakdown | undefined {
  if (!bulkQty || !bulkPrice || bulkQty <= 1) return undefined;
  // Only apply bulk pricing when it's actually cheaper
  if (bulkPrice >= bulkQty * unitPrice) return undefined;
  const packages = Math.floor(qty / bulkQty);
  const remaining = qty % bulkQty;
  const lineTotal = packages * bulkPrice + remaining * unitPrice;
  return { bulkPackages: packages, bulkQty, bulkPrice, remainingUnits: remaining, unitPrice, lineTotal };
}

const calcKeys = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "=", "+"];

const rwf = (value: number) => `${value.toLocaleString()} RWF`;

export function PosPage() {
  const navigate = useNavigate();
  const { authConfigured, can, logout, profile, activeLocationId, assignedLocations, switchLocation } = useAuth();
  const searchRef = useRef<HTMLInputElement>(null);
  const soundRef = useRef<HTMLAudioElement | null>(null);
  const { 
    products: cachedProducts, 
    customers: cachedCustomers, 
    settings: cachedSettings,
    updateProductStock 
  } = usePosData();

  const [products, setProducts] = useState<PosProductRecord[]>(cachedProducts);
  const [customers, setCustomers] = useState<PosCustomerRecord[]>(cachedCustomers);
  const [shopSettings, setShopSettings] = useState<ShopSettingsRecord | null>(cachedSettings);
  const [loading, setLoading] = useState(cachedProducts.length === 0);
  const [pageError, setPageError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("Walk-in Customer");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [closeDayOpen, setCloseDayOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMethod | "multiple" | null>(null);
  const [amountPaid, setAmountPaid] = useState("");
  const [momoAmount, setMomoAmount] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [calcValue, setCalcValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [locationSwitcherOpen, setLocationSwitcherOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeShift, setActiveShift] = useState<any>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [checkingRegister, setCheckingRegister] = useState(true);
  const [startingAmountOpen, setStartingAmountOpen] = useState(false);
  const [startingAmount, setStartingAmount] = useState("");
  const [startingAmountSubmitting, setStartingAmountSubmitting] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [addCustomerSubmitting, setAddCustomerSubmitting] = useState(false);
  const [productPage, setProductPage] = useState(1);
  const [orderDiscount, setOrderDiscount] = useState<{ type: 'percentage' | 'fixed', value: number }>({ type: 'percentage', value: 0 });
  const [discountItemId, setDiscountItemId] = useState<string | null>(null);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [itemDiscountModalOpen, setItemDiscountModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnSale, setReturnSale] = useState<any>(null);
  const [returnItems, setReturnItems] = useState<ReturnItemInput[]>([]);
  const [returnReason, setReturnReason] = useState("");
  const [returnRefundMethod, setReturnRefundMethod] = useState("cash");
  const [returnNotes, setReturnNotes] = useState("");
  const [processingReturn, setProcessingReturn] = useState(false);
  const PRODUCTS_PER_PAGE = 30;

  // Top-level permission check
  if (authConfigured && profile && !can("POS", "view")) {
    return (
      <div className="flex h-screen flex-col items-center justify-center space-y-4 bg-slate-50 px-6 text-center">
        <div className="rounded-full bg-rose-100 p-6 text-rose-600">
          <X size={48} strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl font-bold text-ink">Access Denied</h1>
        <p className="max-w-md text-slate-600">
          You do not have permission to access the POS system. 
          Please contact your administrator if you believe this is an error.
        </p>
        <button
          onClick={() => navigate("/dashboard")}
          className="rounded-2xl bg-brand-500 px-8 py-3 font-semibold text-white shadow-soft transition hover:scale-105"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  function getErrorMessage(error: unknown) {
    if (!error) {
      return "Failed to load POS data.";
    }
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "Failed to load POS data.";
    }
  }

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      setPageError("Supabase is not configured yet. Add your project keys to load real POS data.");
      return;
    }

    if (!authConfigured || !profile || !activeLocationId) {
      setLoading(false);
      setCheckingRegister(false);
      setPageError("Please log in and ensure a location is assigned to access the POS system.");
      return;
    }

    let active = true;

    async function loadPosData() {
      try {
        setPageError(null);
        
        // Sync local state with cache instantly
        if (cachedProducts.length > 0) {
          setProducts(cachedProducts);
          setCustomers(cachedCustomers);
          setShopSettings(cachedSettings);
          setLoading(false);
        }

        setCheckingRegister(true);

        // Only need to fetch register status, as products/customers are handled globally!
        const openReg = await checkOpenRegister(profile!.id, activeLocationId!);

        if (!active) return;

        if (openReg) {
          setActiveShift(openReg);
          setRegisterOpen(true);
        } else {
          setRegisterOpen(false);
          setStartingAmountOpen(true);
        }
      } catch (error) {
        if (!active) return;
        console.error("POS register check error:", error);
        setPageError(getErrorMessage(error));
      } finally {
        if (active) setCheckingRegister(false);
      }
    }

    void loadPosData();

    return () => {
      active = false;
    };
  }, [authConfigured, profile, activeLocationId, cachedProducts, cachedCustomers, cachedSettings]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(normalized) ||
        (product.barcode ?? "").toLowerCase().includes(normalized) ||
        (product.category_name ?? "").toLowerCase().includes(normalized),
    );
  }, [products, query]);

  const filteredCustomers = useMemo(() => {
    const normalized = customerQuery.trim().toLowerCase();
    const realCustomers = ["Walk-in Customer", ...customers.map((customer) => customer.full_name)];
    return realCustomers.filter((customer) => customer.toLowerCase().includes(normalized));
  }, [customerQuery, customers]);

  const pagedProducts = useMemo(() => {
    const start = (productPage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(start, start + PRODUCTS_PER_PAGE);
  }, [filteredProducts, productPage, PRODUCTS_PER_PAGE]);
  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));

  const totalAmount = cart.reduce((sum, item) => {
    const base = item.bulkBreakdown ? item.bulkBreakdown.lineTotal : item.qty * item.price;
    const itemDiscount = item.discount_type === 'percentage' 
      ? base * (item.discount_value / 100)
      : (item.discount_type === 'fixed' ? item.discount_value : 0);
    return sum + Math.max(0, base - itemDiscount);
  }, 0);

  const orderDiscountAmount = orderDiscount.type === 'percentage'
    ? totalAmount * (orderDiscount.value / 100)
    : orderDiscount.value;

  const discountedTotal = Math.max(0, totalAmount - orderDiscountAmount);
  const checkoutTotalAmount = discountedTotal;
  const taxPercentage = shopSettings?.tax_percentage ?? 0;
  const subtotalAmount = Number((checkoutTotalAmount / (1 + taxPercentage / 100)).toFixed(2));
  const checkoutTaxAmount = Number((checkoutTotalAmount - subtotalAmount).toFixed(2));
  const change = Math.max(Number(amountPaid || 0) - checkoutTotalAmount, 0);
  const remaining = checkoutTotalAmount - (Number(momoAmount || 0) + Number(cashAmount || 0));
  const liveTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const liveDate = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const todayIso = new Date().toISOString().slice(0, 10);
  const [closeDaySummary, setCloseDaySummary] = useState({
    cash_amount: 0,
    momo_amount: 0,
    bank_amount: 0,
    card_amount: 0,
    credit_amount: 0,
    total_amount: 0,
  });

  function playAddBeep() {
    try {
      if (!soundRef.current) {
        soundRef.current = new Audio("/sounds/scan.mp3");
        soundRef.current.preload = "auto";
        soundRef.current.volume = 1;
      }

      soundRef.current.currentTime = 0;
      void soundRef.current.play();
    } catch {
      // Ignore audio failures so selling flow stays uninterrupted.
    }
  }

  function playSuccessSound() {
    try {
      // Use a tiny base64 encoded beep to avoid missing file errors
      const audio = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTdvT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT18=");
      audio.volume = 0.5;
      void audio.play().catch(() => { /* Autoplay blocked or failed */ });
    } catch {
      // Audio is optional
    }
  }

  useEffect(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 4) {
      return;
    }

    const barcodeMatch = products.find(
      (product) => (product.barcode ?? "").toLowerCase() === normalized,
    );

    if (barcodeMatch) {
      addToCart(barcodeMatch.id);
      return;
    }

    const nameMatches = products.filter((product) =>
      product.name.toLowerCase().includes(normalized),
    );

    if (nameMatches.length === 1) {
      addToCart(nameMatches[0].id);
    }
  }, [products, query]);

  useEffect(() => {
    if (!closeDayOpen || !profile?.id || !authConfigured || !activeLocationId || !activeShift?.opened_at) {
      return;
    }

    let active = true;

    async function loadCloseDaySummary() {
      try {
        const summary = await getCloseDaySummary(profile!.id, activeLocationId!, activeShift.opened_at);
        if (active) {
          setCloseDaySummary(summary);
        }
      } catch {
        if (active) {
          setCloseDaySummary({
            cash_amount: 0,
            momo_amount: 0,
            bank_amount: 0,
            card_amount: 0,
            credit_amount: 0,
            total_amount: 0,
          });
        }
      }
    }

    void loadCloseDaySummary();

    return () => {
      active = false;
    };
  }, [authConfigured, closeDayOpen, profile?.id, todayIso, activeLocationId, activeShift]);

  function addToCart(productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const price = Number(product.selling_price || 0);
    setCart((current) => {
      const existing = current.find((item) => item.id === productId);
      const newQty = existing ? existing.qty + 1 : 1;
      const breakdown = computeBulkBreakdown(newQty, price, product.bulk_quantity, product.bulk_price);
      if (existing) {
        return current.map((item) =>
          item.id === productId ? { ...item, qty: newQty, bulkBreakdown: breakdown } : item
        );
      }
      return [...current, { 
        id: product.id, 
        name: product.name, 
        price, 
        qty: 1, 
        discount_type: null, 
        discount_value: 0, 
        bulkBreakdown: breakdown 
      }];
    });
    playAddBeep();
    setQuery("");
    searchRef.current?.focus();
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && filteredProducts[0]) {
      event.preventDefault();
      addToCart(filteredProducts[0].id);
    }
  }

  function updateQty(id: string, delta: number) {
    setCart((current) =>
      current
        .map((item) => {
          if (item.id !== id) return item;
          const newQty = Math.max(0, Math.round((item.qty + delta) * 1000) / 1000);
          const product = products.find(p => p.id === id);
          const breakdown = product
            ? computeBulkBreakdown(newQty, item.price, product.bulk_quantity, product.bulk_price)
            : undefined;
          return { ...item, qty: newQty, bulkBreakdown: breakdown };
        })
        .filter((item) => item.qty > 0),
    );
  }

  function setQtyDirect(id: string, value: string) {
    const parsed = parseFloat(value);
    if (value === "" || value === "0" || isNaN(parsed)) {
      setCart((current) => current.map((item) => item.id === id ? { ...item, qty: 0 } : item).filter((item) => item.qty > 0 || item.id !== id));
      return;
    }
    if (parsed > 0) {
      setCart((current) => current.map((item) => {
        if (item.id !== id) return item;
        const product = products.find(p => p.id === id);
        const breakdown = product
          ? computeBulkBreakdown(parsed, item.price, product.bulk_quantity, product.bulk_price)
          : undefined;
        return { ...item, qty: parsed, bulkBreakdown: breakdown };
      }));
    }
  }

  function resetPayment() {
    setPaymentMode(null);
    setAmountPaid("");
    setMomoAmount("");
    setCashAmount("");
    setPaymentError(null);
  }

  async function confirmPayment() {
    if (!profile?.id) {
      setPaymentError("No cashier profile found for this session.");
      return;
    }
    if (paymentMode === "multiple" && remaining !== 0) {
      setPaymentError("Multiple payment must match the total exactly.");
      return;
    }
    if (
      paymentMode &&
      paymentMode !== "multiple" &&
      paymentMode !== "credit" &&
      Number(amountPaid || 0) < checkoutTotalAmount
    ) {
      setPaymentError("Amount paid must cover the full total.");
      return;
    }

    const selectedCustomerRecord = customers.find((customer) => customer.full_name === selectedCustomer) ?? null;
    const finalTotal = checkoutTotalAmount;
    const subtotal = subtotalAmount;
    const taxAmount = checkoutTaxAmount;

    const payments =
      paymentMode === "multiple"
        ? [
            { payment_method: "momo" as PaymentMethod, amount: Number(momoAmount || 0) },
            { payment_method: "cash" as PaymentMethod, amount: Number(cashAmount || 0) },
          ].filter((payment) => payment.amount > 0)
        : paymentMode === "credit"
          ? []
          : [{ payment_method: paymentMode as PaymentMethod, amount: Number(amountPaid || 0) || finalTotal }];

    try {
      setSubmitting(true);
      setPaymentError(null);
      await createPosSale({
        customer_id: selectedCustomerRecord?.id ?? null,
        cashier_id: profile.id,
        subtotal,
        tax_amount: taxAmount,
        total_amount: finalTotal,
        discount_amount: orderDiscountAmount,
        discount_type: orderDiscount.value > 0 ? orderDiscount.type : null,
        payment_method: paymentMode === "multiple" ? null : (paymentMode as PaymentMethod | null),
        payment_status: paymentMode === "credit" ? "unpaid" : "paid",
        notes: paymentMode === "credit" ? "Sale recorded on credit." : undefined,
        items: cart.map((item) => {
          const base = item.bulkBreakdown ? item.bulkBreakdown.lineTotal : item.qty * item.price;
          const itemDiscount = item.discount_type === 'percentage' 
            ? base * (item.discount_value / 100)
            : (item.discount_type === 'fixed' ? item.discount_value : 0);
          
          return {
            product_id: item.id,
            quantity: item.qty,
            unit_price: item.price,
            line_total: Math.max(0, base - itemDiscount),
            discount_amount: itemDiscount,
            discount_type: item.discount_value > 0 ? item.discount_type : null,
          };
        }),
        payments,
        location_id: activeLocationId,
      } as any);

      playSuccessSound();

      // OPTIMIZATION: Update global stock immediately
      const soldItemsMap = new Map(cart.map((item) => [item.id, item.qty]));
      cart.forEach(item => {
        const p = products.find(prod => prod.id === item.id);
        if (p) {
          updateProductStock(p.id, p.stock_quantity - item.qty);
        }
      });

      setCart([]);
      setCheckoutOpen(false);
      setOrderDiscount({ type: 'percentage', value: 0 });
      resetPayment();
      searchRef.current?.focus();
    } catch (error) {
      setPaymentError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickAddCustomer() {
    if (!newCustomerName.trim()) return;
    try {
      setAddCustomerSubmitting(true);
      const customer = await createCustomer({
        full_name: newCustomerName,
        phone: newCustomerPhone,
        email: "",
        address: newCustomerAddress
      });
      
      // Update local state if needed (though pre-fetch will catch it, we want it NOW)
      setCustomers(prev => [...prev, customer]);
      setSelectedCustomer(customer.full_name);
      
      // Reset and close
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerAddress("");
      setAddCustomerOpen(false);
      setAddCustomerSubmitting(false);
    } catch (err) {
      console.error("Failed to add customer:", err);
      setAddCustomerSubmitting(false);
    }
  }

  function onCalcKey(key: string) {
    if (key === "=") {
      try {
        const result = Function(`"use strict"; return (${calcValue || "0"})`)();
        setCalcValue(String(result));
      } catch {
        setCalcValue("Error");
      }
      return;
    }
    setCalcValue((current) => `${current}${key}`);
  }

  async function confirmCloseDay() {
    if (profile?.id && authConfigured && activeLocationId) {
      try {
        await createDayClosure({
          user_id: profile.id,
          location_id: activeLocationId,
          closing_date: todayIso,
          cash_amount: closeDaySummary.cash_amount,
          momo_amount: closeDaySummary.momo_amount,
          bank_amount: closeDaySummary.bank_amount,
          card_amount: closeDaySummary.card_amount,
          credit_amount: closeDaySummary.credit_amount,
          total_amount: closeDaySummary.total_amount,
        });
      } catch (err) {
        console.error("Failed to close day:", err);
      }
    }
    setCloseDayOpen(false);
  }

  async function loadRecentSales() {
    try {
      setHistoryLoading(true);
      const { data } = await listSales({ 
        page: 1, 
        pageSize: 20,
        minDate: activeShift?.opened_at ? activeShift.opened_at : undefined 
      });
      setRecentSales(data);
    } catch (err) {
      console.error("Failed to load recent sales:", err);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openReturnModal(sale: any) {
    try {
      setSubmitting(true);
      const details = await getSaleDetails(sale.id);
      setReturnSale(details);
      setReturnItems((details.sale_items || []).map((item: any) => ({
        sale_item_id: item.id,
        product_id: item.product_id || item.products?.id,
        product_name: item.products?.name || "Unknown",
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        restock: true,
      })));
      setReturnReason("");
      setReturnRefundMethod("cash");
      setReturnNotes("");
      setReturnModalOpen(true);
    } catch (err) {
      console.error("Failed to load sale details for return:", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmReturn() {
    if (!returnSale || !profile?.id) return;
    const selectedItems = returnItems.filter((i) => i.quantity > 0);
    if (!selectedItems.length) return;

    try {
      setProcessingReturn(true);
      await processReturn({
        sale_id: returnSale.id,
        created_by: profile.id,
        reason: returnReason,
        refund_method: returnRefundMethod,
        notes: returnNotes,
        items: selectedItems,
      });

      playSuccessSound();
      setReturnModalOpen(false);
      setHistoryOpen(false);
      // Refresh products to show updated stock
      void listPosProducts(null, 500).then(setProducts);
    } catch (err) {
      console.error("Return failed:", err);
    } finally {
      setProcessingReturn(false);
    }
  }
  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    navigate("/login");
  }

  async function handleOpenRegister() {
    if (!profile?.id || !activeLocationId) return;
    try {
      setStartingAmountSubmitting(true);
      const reg = await openRegister(profile.id, activeLocationId, Number(startingAmount || 0));
      setActiveShift(reg);
      setRegisterOpen(true);
      setStartingAmountOpen(false);
    } catch (err) {
      setPageError(getErrorMessage(err));
    } finally {
      setStartingAmountSubmitting(false);
    }
  }

  if (!activeLocationId) {
    return (
      <div className="flex h-screen flex-col items-center justify-center space-y-4 bg-slate-900 px-6 text-center text-white">
        <div className="rounded-full bg-slate-800 p-6 text-brand-400">
          <MapPin size={48} strokeWidth={2} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">No Location Assigned</h1>
        <p className="max-w-md text-slate-400">
          Your account is not currently assigned to any store location. 
          Please contact your administrator to assign you to a branch before accessing the POS.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="rounded-2xl border border-slate-700 bg-slate-800 px-8 py-3 font-semibold text-white transition hover:bg-slate-700"
          >
            Dashboard
          </button>
          <button
            onClick={() => void logout()}
            className="rounded-2xl bg-rose-500 px-8 py-3 font-semibold text-white shadow-soft transition hover:bg-rose-600"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  if (startingAmountOpen) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-100 px-6 text-center">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-soft">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Calculator size={32} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Start Shift</h1>
          <p className="mt-2 text-sm text-slate-500">
            Please enter your starting cash float for this register before accessing the POS.
          </p>
          <div className="mt-8 space-y-4">
            <div>
              <label className="block text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                Opening Cash Amount (RWF)
              </label>
              <input
                type="number"
                min="0"
                value={startingAmount}
                onChange={(e) => setStartingAmount(e.target.value)}
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-brand-300"
                placeholder="e.g. 50000"
                autoFocus
              />
            </div>
            <button
              onClick={handleOpenRegister}
              disabled={startingAmountSubmitting}
              className="w-full rounded-2xl bg-brand-500 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-600 disabled:opacity-50"
            >
              {startingAmountSubmitting ? "Opening..." : "Open Register"}
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="w-full rounded-2xl bg-slate-100 py-3.5 font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!registerOpen && checkingRegister) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center font-medium text-slate-500">
          Checking register status...
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-100 px-2 py-1 text-ink sm:px-3 lg:px-4">
      <div className="mx-auto flex h-full max-w-[1700px] flex-col">
        <div className="mb-1 rounded-[16px] bg-white px-2 py-1 shadow-soft">
          <div className="flex h-12 items-center gap-2 xl:flex-nowrap">
            <div className="order-1 grid gap-2 sm:grid-cols-4 xl:max-w-[200px]">
              <button
                onClick={() => { setHistoryOpen(true); void loadRecentSales(); }}
                title="Recent Sales"
                className="flex h-10 items-center justify-center rounded-2xl bg-slate-100 px-3 text-slate-700 transition hover:bg-slate-200"
              >
                <History size={14} />
              </button>
              <button
                onClick={() => setCloseDayOpen(true)}
                title="Close Day"
                className="flex h-10 items-center justify-center rounded-2xl bg-rose-50 px-3 text-rose-700 transition hover:bg-rose-100"
              >
                <Clock3 size={14} />
              </button>
              <button
                onClick={() => setCalculatorOpen(true)}
                title="Calculator"
                className="flex h-10 items-center justify-center rounded-2xl bg-amber-50 px-3 text-amber-700 transition hover:bg-amber-100"
              >
                <Calculator size={14} />
              </button>
              <button
                onClick={() => navigate("/dashboard")}
                title="Dashboard"
                className="flex h-10 items-center justify-center rounded-2xl bg-brand-50 px-3 text-brand-700 transition hover:bg-brand-100"
              >
                <LayoutDashboard size={14} />
              </button>
            </div>

            <div className="order-2 flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-50 px-3 text-center">
              <Clock3 size={13} className="text-brand-600" />
              <p className="truncate text-xs font-semibold text-ink">{liveTime}</p>
              <p className="truncate text-[11px] text-slate-500">{liveDate}</p>
            </div>

            <div className="relative order-3 ml-auto">
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-end mr-1">
                   <p className="max-w-28 truncate text-xs font-semibold text-ink leading-tight">
                     {profile?.full_name ?? "Active Cashier"}
                   </p>
                   <div className="relative">
                     <button
                       onClick={() => setLocationSwitcherOpen(!locationSwitcherOpen)}
                       className="flex items-center gap-1.5 text-[10px] font-bold text-brand-600 uppercase tracking-wider leading-tight hover:text-brand-800 hover:bg-brand-50 rounded-md px-2 py-1 -mx-2 transition-all active:scale-95"
                     >
                       <MapPin size={10} className="text-brand-500" />
                       {assignedLocations.find(l => l.id === activeLocationId)?.name || "No Location"}
                       {assignedLocations.length > 1 && (
                         <ChevronDown 
                           size={10} 
                           className={`transition-transform duration-200 ${locationSwitcherOpen ? 'rotate-180' : ''}`} 
                         />
                       )}
                     </button>
                     
                     {locationSwitcherOpen && assignedLocations.length > 1 && (
                       <div className="absolute right-0 top-full z-50 mt-1 min-w-[150px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                         {assignedLocations.map((loc) => (
                           <button
                             key={loc.id}
                             onClick={() => {
                               switchLocation(loc.id);
                               setLocationSwitcherOpen(false);
                             }}
                             className={`flex w-full items-center px-3 py-2 text-left text-[11px] font-semibold transition ${
                               loc.id === activeLocationId ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                             }`}
                           >
                             <MapPin size={10} className="mr-2 opacity-50" />
                             {loc.name}
                           </button>
                         ))}
                       </div>
                     )}
                   </div>
                </div>

                <button
                  onClick={() => setMenuOpen((current) => !current)}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 transition hover:bg-slate-100"
                >
                  <ChevronDown size={14} className={`text-slate-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {menuOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 min-w-52 rounded-2xl border border-slate-200 bg-white p-2 shadow-soft">
                  <div className="rounded-xl px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                    {profile?.role ?? "cashier"}
                  </div>
                  <button
                    onClick={() => void logout()}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut size={16} />
                    Logout
                  </button>
                  <div className="my-2 border-t border-slate-100" />
                  <button
                    onClick={() => playSuccessSound()}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <Receipt size={16} className="text-emerald-500" />
                    Test Success Sound
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid flex-1 gap-1 xl:grid-cols-[0.92fr_1.08fr]" style={{ minHeight: 0, height: 'calc(100vh - 56px)' }}>
          <section className="flex min-h-0 flex-col gap-1">
            {pageError ? (
              <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {pageError}
              </div>
            ) : null}

            <div className="rounded-[22px] bg-white p-3 shadow-soft">
              <div className="grid gap-3 lg:grid-cols-[1.3fr_auto]">
                <div className="relative">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={onSearchKeyDown}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-brand-300"
                    placeholder="Scan or search product..."
                  />
                  {!!query && filteredProducts.length > 0 ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-2xl border border-slate-800 bg-slate-950 p-2 shadow-soft">
                      {filteredProducts.slice(0, 4).map((product) => (
                        <button
                          key={product.id}
                          onClick={() => addToCart(product.id)}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-slate-900"
                        >
                          <div>
                            <p className="font-semibold text-white">{product.name}</p>
                            <p className="text-xs text-slate-400">{product.barcode}</p>
                          </div>
                          <span className="text-sm font-semibold text-sky-300">{rwf(product.selling_price)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-200 bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100">
                  <Camera size={18} />
                  Scan Barcode
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-[22px] bg-white p-3 shadow-soft flex flex-col">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold">Product Grid</h2>
                  <p className="text-xs text-slate-400">
                    {loading ? "Syncing..." : `${filteredProducts.length} products — Click to add`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setProductPage(p => Math.max(1, p - 1))}
                    disabled={productPage <= 1}
                    className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="text-xs font-semibold text-slate-500">{productPage}/{totalProductPages}</span>
                  <button
                    onClick={() => setProductPage(p => Math.min(totalProductPages, p + 1))}
                    disabled={productPage >= totalProductPages}
                    className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              <div className="grid gap-2.5 overflow-y-auto pr-1 flex-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', alignContent: 'start' }}>
                {pagedProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product.id)}
                    className={`flex flex-col overflow-hidden rounded-[1.25rem] border bg-white p-2 text-left transition duration-200 hover:shadow-lg active:scale-95 ${
                      product.stock_quantity <= 0
                        ? 'border-slate-100 opacity-60'
                        : product.stock_quantity <= product.reorder_level
                        ? 'border-amber-200 bg-amber-50/40 hover:border-amber-300'
                        : 'border-slate-100 hover:border-brand-300'
                    }`}
                  >
                    {product.image_url ? (
                      <div className="mb-2 h-[88px] w-full shrink-0 overflow-hidden rounded-xl bg-slate-50">
                        <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="mb-2 flex h-[88px] w-full shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 text-slate-300">
                        <span className="text-[9px] font-bold uppercase tracking-widest opacity-50">No Image</span>
                      </div>
                    )}
                    <div className="flex w-full flex-1 flex-col justify-between px-1 pb-0.5">
                      <p className="line-clamp-2 text-[13px] font-black leading-tight text-ink">{product.name}</p>
                      <div className="mt-2 flex items-center justify-between gap-1 w-full">
                        <span className="text-[13px] font-black text-brand-600">{product.selling_price.toLocaleString()}</span>
                        <span className={`text-[10px] font-black rounded-lg px-2 py-0.5 ${
                          product.stock_quantity <= 0 ? 'bg-rose-100 text-rose-600' :
                          product.stock_quantity <= product.reorder_level ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-50 text-emerald-700'
                        }`}>{product.stock_quantity <= 0 ? 'OUT' : `×${product.stock_quantity}`}</span>
                      </div>
                    </div>
                  </button>
                ))}
                {!loading && !filteredProducts.length ? (
                  <div className="col-span-full rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    No products found.
                  </div>
                ) : null}
              </div>
            </div>

          </section>

          <aside className="flex flex-col overflow-hidden rounded-[22px] bg-slate-950 p-2 text-white shadow-soft" style={{ minHeight: 0 }}>
            <div className="flex min-h-0 flex-1 flex-col space-y-3">
              <div className="w-full rounded-3xl border border-slate-800 bg-slate-900 p-2.5">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      value={customerQuery}
                      onChange={(event) => setCustomerQuery(event.target.value)}
                      className={`w-full rounded-2xl bg-slate-950 py-2.5 pl-10 pr-12 text-sm text-white outline-none ${
                        selectedCustomer && selectedCustomer !== "Walk-in Customer"
                          ? "border border-brand-500"
                          : "border border-slate-700"
                      }`}
                      placeholder={selectedCustomer}
                    />
                    <button 
                      onClick={() => setAddCustomerOpen(true)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 transition hover:bg-brand-500 hover:text-white"
                      title="Add New Customer"
                    >
                      <UserPlus size={16} />
                    </button>
                  {!!customerQuery && filteredCustomers.length > 0 ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-lg">
                      {filteredCustomers.slice(0, 5).map((customer) => (
                        <button
                          key={customer}
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setCustomerQuery("");
                          }}
                          className="flex w-full items-center px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                        >
                          <UserPlus size={14} className="mr-3 opacity-50" />
                          {customer}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col space-y-2 overflow-y-auto pr-1 min-h-[320px]">
                {cart.length > 0 ? (
                  cart.map((item) => (
                    <div
                      key={item.id}
                      className="group flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 pr-4 transition hover:bg-slate-900"
                    >
                      {/* 1. NAME (Increased Font) */}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-base font-bold text-white leading-tight">{item.name}</p>
                        {item.discount_value > 0 && (
                          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-tighter">
                            {item.discount_type === 'percentage' ? `-${item.discount_value}%` : `-${item.discount_value} RWF`}
                          </p>
                        )}
                      </div>

                      {/* 2. DISCOUNT BUTTON */}
                      <button
                        onClick={() => {
                          setDiscountItemId(item.id);
                          setItemDiscountModalOpen(true);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition shrink-0 ${
                          item.discount_value > 0 ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                        }`}
                      >
                        {item.discount_value > 0 ? "Disc" : "Add Disc"}
                      </button>

                      {/* 3. QTY CONTROL */}
                      <div className="flex items-center gap-1 rounded-xl bg-slate-950 p-1 shrink-0">
                        <button onClick={() => updateQty(item.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white transition">
                          <Minus size={14} />
                        </button>
                        <input
                          type="number" min="0.01" step="0.01" value={item.qty}
                          onChange={(e) => setQtyDirect(item.id, e.target.value)}
                          className="w-12 bg-transparent text-center text-sm font-bold text-white outline-none"
                        />
                        <button onClick={() => updateQty(item.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white transition">
                          <Plus size={14} />
                        </button>
                      </div>

                      {/* 4. PRICE (Increased Font) */}
                      <div className="text-right min-w-[90px] shrink-0">
                        <span className="text-base font-black text-brand-400">
                          {rwf(item.bulkBreakdown 
                            ? (item.bulkBreakdown.lineTotal - (item.discount_type === 'percentage' ? item.bulkBreakdown.lineTotal * (item.discount_value / 100) : (item.discount_type === 'fixed' ? item.discount_value : 0)))
                            : (item.qty * item.price - (item.discount_type === 'percentage' ? item.qty * item.price * (item.discount_value / 100) : (item.discount_type === 'fixed' ? item.discount_value : 0)))
                          )}
                        </span>
                      </div>

                      {/* 5. TRASH */}
                      <button
                        onClick={() => updateQty(item.id, -item.qty)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 transition hover:bg-rose-500 hover:text-white shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center text-center opacity-30">
                    <ShoppingBag size={48} strokeWidth={1} />
                    <p className="mt-4 text-sm font-semibold tracking-widest uppercase">Cart Empty</p>
                  </div>
                )}
              </div>

              <div className="rounded-3xl bg-slate-900 p-5 space-y-4">
                <div className="space-y-2.5">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-500">
                    <span>Subtotal</span>
                    <span>{rwf(totalAmount)}</span>
                  </div>
                  {orderDiscount.value > 0 && (
                    <div className="flex justify-between text-xs font-bold text-emerald-400">
                      <span>Order Discount ({orderDiscount.type === 'percentage' ? `${orderDiscount.value}%` : rwf(orderDiscount.value)})</span>
                      <span>-{rwf(orderDiscountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-500">
                    <span>Tax ({taxPercentage}%)</span>
                    <span>{rwf(checkoutTaxAmount)}</span>
                  </div>
                  <div className="my-3 border-t border-slate-800 border-dashed" />
                  <div className="flex justify-between text-lg font-black text-white">
                    <span className="uppercase tracking-tighter">Total RWF</span>
                    <span className="text-brand-400">{rwf(checkoutTotalAmount)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDiscountModalOpen(true)}
                    className={`flex items-center justify-center gap-2 rounded-2xl border-2 py-3.5 text-[10px] font-black uppercase tracking-widest transition active:scale-95 ${
                      orderDiscount.value > 0
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900"
                    }`}
                  >
                    <Tag size={13} />
                    {orderDiscount.value > 0 ? "Edit Disc" : "Disc"}
                  </button>
                  <button
                    onClick={() => setCheckoutOpen(true)}
                    disabled={cart.length === 0}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3.5 text-sm font-bold text-white shadow-soft transition-all hover:bg-brand-600 disabled:opacity-30 disabled:scale-100 active:scale-95"
                  >
                    <Receipt size={20} />
                    Checkout
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

       {/* STARTING AMOUNT MODAL */}
       {startingAmountOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-scale-in rounded-[2.5rem] bg-white p-8 shadow-2xl">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Calculator size={32} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Start Shift</h1>
            <p className="mt-2 text-sm text-slate-500">
              Please enter your starting cash float for this register before accessing the POS.
            </p>
            <div className="mt-8 space-y-4">
              <div>
                <label className="block text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Opening Cash Amount (RWF)
                </label>
                <input
                  type="number"
                  min="0"
                  value={startingAmount}
                  onChange={(e) => setStartingAmount(e.target.value)}
                  className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-brand-300"
                  placeholder="e.g. 50000"
                  autoFocus
                />
              </div>
              <button
                onClick={handleOpenRegister}
                disabled={startingAmountSubmitting}
                className="w-full rounded-2xl bg-brand-500 py-3.5 font-semibold text-white shadow-soft transition hover:bg-brand-600 disabled:opacity-50"
              >
                {startingAmountSubmitting ? "Opening..." : "Open Register"}
              </button>
              <button
                onClick={() => navigate("/dashboard")}
                className="w-full rounded-2xl bg-slate-100 py-3.5 font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-md">
          <div className="w-full max-w-4xl animate-scale-in overflow-hidden rounded-[2.5rem] bg-white shadow-2xl">
            <div className="grid lg:grid-cols-[1fr_1.1fr]">
              <div className="bg-slate-50 p-8 lg:p-10">
                <div className="mb-8 flex items-center justify-between">
                  <button onClick={() => setCheckoutOpen(false)} className="rounded-full bg-white p-2.5 text-slate-400 shadow-sm hover:text-slate-600">
                    <X size={20} />
                  </button>
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Order Summary</span>
                </div>

                <div className="max-h-[300px] space-y-4 overflow-y-auto pr-2">
                  {cart.map((item) => (
                    <div key={item.id} className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <div className="flex gap-3">
                          <span className="font-bold text-slate-400">x{item.qty}</span>
                          <span className="font-semibold text-ink line-clamp-1">{item.name}</span>
                        </div>
                        <span className="font-bold text-slate-600">
                          {item.bulkBreakdown ? rwf(item.bulkBreakdown.lineTotal) : rwf(item.qty * item.price)}
                        </span>
                      </div>
                      {item.bulkBreakdown && item.bulkBreakdown.bulkPackages > 0 && (
                        <div className="ml-8 space-y-0.5">
                          {item.bulkBreakdown.bulkPackages > 0 && (
                            <p className="text-[10px] text-emerald-600 font-semibold">
                              {item.bulkBreakdown.bulkPackages} Box({item.bulkBreakdown.bulkQty}) × {rwf(item.bulkBreakdown.bulkPrice)}
                            </p>
                          )}
                          {item.bulkBreakdown.remainingUnits > 0 && (
                            <p className="text-[10px] text-slate-400">
                              {item.bulkBreakdown.remainingUnits} Unit × {rwf(item.bulkBreakdown.unitPrice)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-10 space-y-3 rounded-3xl bg-white p-6 shadow-sm">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                    <span>Subtotal</span>
                    <span>{rwf(subtotalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                    <span>Tax</span>
                    <span>{rwf(checkoutTaxAmount)}</span>
                  </div>
                  <div className="my-4 border-t border-slate-100" />
                  <div className="flex justify-between text-xl font-black text-ink">
                    <span>TOTAL</span>
                    <span className="text-brand-600">{rwf(checkoutTotalAmount)}</span>
                  </div>
                </div>
              </div>

              <div className="p-8 lg:p-10">
                <h3 className="text-2xl font-black text-ink uppercase tracking-tight">Select Payment</h3>
                <p className="mt-2 text-sm text-slate-500">Choose how the customer prefers to pay for this purchase.</p>

                <div className="mt-8 grid grid-cols-2 gap-3">
                  {[
                    { id: "cash", label: "Cash", icon: Wallet, color: "emerald" },
                    { id: "momo", label: "Momo", icon: Tablet, color: "amber" },
                    { id: "bank", label: "Bank Card", icon: CreditCard, color: "sky" },
                    { id: "multiple", label: "Multiple", icon: Receipt, color: "indigo" },
                    { id: "credit", label: "Credit", icon: UserPlus, color: "rose" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setPaymentMode(mode.id as any);
                        if (mode.id === "multiple") {
                           setMomoAmount("");
                           setCashAmount(String(checkoutTotalAmount));
                        } else if (mode.id !== "credit") {
                           setAmountPaid(String(checkoutTotalAmount));
                        }
                        setPaymentError(null);
                      }}
                      className={`flex flex-col items-center justify-center gap-3 rounded-3xl border-2 p-5 transition-all ${
                        paymentMode === mode.id
                          ? `border-brand-500 bg-brand-50/50 shadow-soft scale-[1.02]`
                          : "border-slate-50 hover:border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <mode.icon className={paymentMode === mode.id ? "text-brand-600" : "text-slate-300"} size={28} />
                      <span className={`text-[11px] font-bold uppercase tracking-widest ${
                        paymentMode === mode.id ? "text-brand-700" : "text-slate-500"
                      }`}>{mode.label}</span>
                    </button>
                  ))}
                </div>

                {paymentMode && paymentMode !== "multiple" && paymentMode !== "credit" && (
                  <div className="mt-8 animate-fade-in space-y-5">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Amount Received (RWF)</label>
                      <div className="relative mt-2">
                        <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                        <input
                          type="number"
                          value={amountPaid}
                          onChange={(e) => setAmountPaid(e.target.value)}
                          className="w-full rounded-2xl bg-slate-50 py-4 pl-11 pr-4 text-xl font-bold outline-none focus:ring-2 focus:ring-brand-200"
                          placeholder={`${checkoutTotalAmount}`}
                          autoFocus
                        />
                      </div>
                    </div>
                    {Number(amountPaid) > checkoutTotalAmount && (
                      <div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4 text-emerald-700">
                        <span className="text-sm font-bold uppercase tracking-widest">Change Due</span>
                        <span className="text-xl font-black">{rwf(change)}</span>
                      </div>
                    )}
                  </div>
                )}

                {paymentMode === "multiple" && (
                  <div className="mt-8 animate-fade-in space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Momo Amount</label>
                        <input
                          type="number"
                          value={momoAmount}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMomoAmount(val);
                            const numVal = Number(val) || 0;
                            const remainingVal = Math.max(0, checkoutTotalAmount - numVal);
                            setCashAmount(String(remainingVal));
                          }}
                          className="mt-2 w-full rounded-2xl bg-slate-50 p-4 font-bold outline-none ring-offset-2 focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cash Amount</label>
                        <input
                          type="number"
                          value={cashAmount}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCashAmount(val);
                            const numVal = Number(val) || 0;
                            const remainingVal = Math.max(0, checkoutTotalAmount - numVal);
                            setMomoAmount(String(remainingVal));
                          }}
                          className="mt-2 w-full rounded-2xl bg-slate-50 p-4 font-bold outline-none ring-offset-2 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-dashed border-slate-200 p-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Remaining</span>
                      <span className={`text-lg font-black ${remaining === 0 ? "text-emerald-500" : remaining < 0 ? "text-rose-500" : "text-amber-500"}`}>
                        {rwf(remaining)}
                      </span>
                    </div>
                  </div>
                )}

                {paymentError && (
                  <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-xs font-semibold text-rose-600 animate-shake">
                    {paymentError}
                  </div>
                )}

                <div className="mt-8 flex gap-3">
                  <button
                    onClick={confirmPayment}
                    disabled={submitting || !paymentMode || (paymentMode === "multiple" && remaining !== 0)}
                    className="flex-1 rounded-2xl bg-slate-950 py-4 font-bold text-white shadow-xl transition hover:bg-black disabled:opacity-30 active:scale-95"
                  >
                    {submitting ? "Processing..." : "Finish Receipt"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CALCULATOR MODAL */}
      {calculatorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[320px] animate-scale-in rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Calculator</h3>
              <button 
                onClick={() => {
                  setCalculatorOpen(false);
                  setCalcValue("");
                }} 
                className="text-slate-300 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="mb-4 rounded-2xl bg-slate-50 p-6 text-right">
              <p className="min-h-[2.5rem] text-3xl font-black text-ink">{calcValue || "0"}</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => setCalcValue("")} className="col-span-2 rounded-xl bg-rose-50 p-4 font-bold text-rose-600 hover:bg-rose-100">C</button>
              <button onClick={() => setCalcValue(v => v.slice(0,-1))} className="col-span-2 rounded-xl bg-slate-100 p-4 font-bold text-slate-600 hover:bg-slate-200">DEL</button>
              {calcKeys.map(key => (
                <button
                  key={key}
                  onClick={() => onCalcKey(key)}
                  className={`rounded-xl p-4 text-sm font-bold shadow-sm transition active:scale-90 ${
                    ['/', '*', '-', '+', '='].includes(key)
                      ? "bg-brand-500 text-white hover:bg-brand-600"
                      : "bg-white border border-slate-100 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {key === "*" ? "×" : key === "/" ? "÷" : key}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CLOSE DAY MODAL */}
      {closeDayOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-4 backdrop-blur-md">
          <div className="w-full max-w-lg animate-scale-in rounded-[3rem] bg-white p-8 shadow-2xl">
             <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 text-rose-600">
               <Clock3 size={40} />
             </div>
             <h2 className="text-center text-3xl font-black text-ink tracking-tight">Close Your Shift</h2>
             <p className="mt-2 text-center text-sm text-slate-500">Review your final sales before logging out for the day.</p>

             <div className="mt-8 space-y-3">
               <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-3xl bg-slate-50 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cash Sales</p>
                    <p className="mt-1 text-lg font-black text-ink">{rwf(closeDaySummary.cash_amount)}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Momo Sales</p>
                    <p className="mt-1 text-lg font-black text-ink">{rwf(closeDaySummary.momo_amount)}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Bank Sales</p>
                    <p className="mt-1 text-lg font-black text-ink">{rwf(closeDaySummary.bank_amount)}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Card Sales</p>
                    <p className="mt-1 text-lg font-black text-ink">{rwf(closeDaySummary.card_amount)}</p>
                  </div>
               </div>
               <div className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 opacity-60">Total Closed Sales</p>
                      <p className="mt-1 text-2xl font-black text-brand-400">{rwf(closeDaySummary.total_amount)}</p>
                    </div>
                    <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center">
                      <Receipt size={24} className="text-white/40" />
                    </div>
                  </div>
               </div>
             </div>

             <div className="mt-8 grid grid-cols-2 gap-4">
                <button
                  onClick={() => setCloseDayOpen(false)}
                  className="rounded-2xl border border-slate-100 py-4 font-bold text-slate-400 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmCloseDay}
                  className="rounded-2xl bg-rose-500 py-4 font-bold text-white shadow-soft hover:bg-rose-600 transition active:scale-95"
                >
                  End Shift & Logout
                </button>
             </div>
          </div>
        </div>
      )}
      {/* QUICK ADD CUSTOMER MODAL */}
      {addCustomerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setAddCustomerOpen(false)}>
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2.5rem] bg-white shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Quick Operations</p>
                <h2 className="mt-1 text-2xl font-bold text-ink">New Customer Record</h2>
              </div>
              <button onClick={() => setAddCustomerOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 overflow-y-auto px-6 py-6 md:grid-cols-2">
              <label className="rounded-2xl bg-slate-50 p-4">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Customer Name</span>
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-200"
                  placeholder="Full name"
                  autoFocus
                />
              </label>

              <label className="rounded-2xl bg-sky-50 p-4">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Contact</span>
                <input
                  type="text"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-sky-100 bg-white px-4 py-3 text-sm outline-none focus:border-brand-200"
                  placeholder="Phone or email"
                />
              </label>

              <label className="col-span-full rounded-2xl bg-slate-50 p-4">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Address</span>
                <input
                  type="text"
                  value={newCustomerAddress}
                  onChange={(e) => setNewCustomerAddress(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand-200"
                  placeholder="Street, city"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-5">
              <button
                onClick={() => setAddCustomerOpen(false)}
                className="rounded-2xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleQuickAddCustomer}
                disabled={addCustomerSubmitting || !newCustomerName.trim()}
                className="rounded-2xl bg-brand-500 px-8 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-600 disabled:opacity-50"
              >
                {addCustomerSubmitting ? "Adding..." : "Create & Select"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISCOUNT MODAL (GLOBAL) */}
      {discountModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[2.5rem] bg-white p-8 shadow-2xl animate-scale-in">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-black text-ink uppercase tracking-tight">Order Discount</h3>
              <button onClick={() => setDiscountModalOpen(false)} className="text-slate-300 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                <button
                  onClick={() => setOrderDiscount(prev => ({ ...prev, type: 'percentage' }))}
                  className={`rounded-xl py-3 text-xs font-bold uppercase tracking-widest transition ${
                    orderDiscount.type === 'percentage' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:bg-white/50'
                  }`}
                >
                  <Percent size={14} className="inline mr-2" /> Percentage
                </button>
                <button
                  onClick={() => setOrderDiscount(prev => ({ ...prev, type: 'fixed' }))}
                  className={`rounded-xl py-3 text-xs font-bold uppercase tracking-widest transition ${
                    orderDiscount.type === 'fixed' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:bg-white/50'
                  }`}
                >
                  <Calculator size={14} className="inline mr-2" /> Fixed Amount
                </button>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                  Discount Value ({orderDiscount.type === 'percentage' ? '%' : 'RWF'})
                </label>
                <input
                  type="number"
                  value={orderDiscount.value}
                  onChange={(e) => setOrderDiscount(prev => ({ ...prev, value: Number(e.target.value) }))}
                  className="w-full rounded-2xl bg-slate-50 py-4 px-6 text-2xl font-black text-ink outline-none focus:ring-2 focus:ring-brand-200"
                  autoFocus
                />
              </div>

              <div className="rounded-2xl bg-emerald-50 p-4 border border-emerald-100">
                <div className="flex justify-between items-center text-emerald-700">
                  <span className="text-sm font-bold">Estimated Savings:</span>
                  <span className="text-lg font-black">{rwf(orderDiscountAmount)}</span>
                </div>
              </div>

              <button
                onClick={() => setDiscountModalOpen(false)}
                className="w-full rounded-2xl bg-slate-900 py-4 font-bold text-white shadow-xl hover:bg-black transition active:scale-95"
              >
                Apply to Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ITEM DISCOUNT MODAL */}
      {itemDiscountModalOpen && discountItemId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[2.5rem] bg-white p-8 shadow-2xl animate-scale-in">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-ink uppercase tracking-tight">Line Discount</h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[250px] font-semibold">
                  {cart.find(i => i.id === discountItemId)?.name}
                </p>
              </div>
              <button onClick={() => setItemDiscountModalOpen(false)} className="text-slate-300 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                <button
                  onClick={() => setCart(prev => prev.map(i => i.id === discountItemId ? { ...i, discount_type: 'percentage' } : i))}
                  className={`rounded-xl py-3 text-xs font-bold uppercase tracking-widest transition ${
                    cart.find(i => i.id === discountItemId)?.discount_type === 'percentage' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:bg-white/50'
                  }`}
                >
                  <Percent size={14} className="inline mr-2" /> Percentage
                </button>
                <button
                  onClick={() => setCart(prev => prev.map(i => i.id === discountItemId ? { ...i, discount_type: 'fixed' } : i))}
                  className={`rounded-xl py-3 text-xs font-bold uppercase tracking-widest transition ${
                    cart.find(i => i.id === discountItemId)?.discount_type === 'fixed' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:bg-white/50'
                  }`}
                >
                  <Calculator size={14} className="inline mr-2" /> Fixed Amount
                </button>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                  Discount Value ({cart.find(i => i.id === discountItemId)?.discount_type === 'percentage' ? '%' : 'RWF'})
                </label>
                <input
                  type="number"
                  value={cart.find(i => i.id === discountItemId)?.discount_value || 0}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCart(prev => prev.map(i => i.id === discountItemId ? { ...i, discount_value: val, discount_type: i.discount_type || 'percentage' } : i));
                  }}
                  className="w-full rounded-2xl bg-slate-50 py-4 px-6 text-2xl font-black text-ink outline-none focus:ring-2 focus:ring-brand-200"
                  autoFocus
                />
              </div>

              <div className="rounded-2xl bg-emerald-50 p-4 border border-emerald-100">
                <div className="flex justify-between items-center text-emerald-700">
                  <span className="text-sm font-bold">Item Net Price:</span>
                  <span className="text-lg font-black">
                    {(() => {
                      const item = cart.find(i => i.id === discountItemId);
                      if (!item) return "0 RWF";
                      const base = item.bulkBreakdown ? item.bulkBreakdown.lineTotal : item.qty * item.price;
                      const disc = item.discount_type === 'percentage' ? base * (item.discount_value / 100) : item.discount_value;
                      return rwf(Math.max(0, base - disc));
                    })()}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                     setCart(prev => prev.map(i => i.id === discountItemId ? { ...i, discount_value: 0, discount_type: null } : i));
                     setItemDiscountModalOpen(false);
                  }}
                  className="flex-1 rounded-2xl bg-rose-50 py-4 font-bold text-rose-600 hover:bg-rose-100 transition"
                >
                  Clear
                </button>
                <button
                  onClick={() => setItemDiscountModalOpen(false)}
                  className="flex-[2] rounded-2xl bg-slate-900 py-4 font-bold text-white shadow-xl hover:bg-black transition active:scale-95"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POS HISTORY SIDEBAR */}
      {historyOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-slate-950/40 backdrop-blur-sm" onClick={() => setHistoryOpen(false)}>
          <div className="h-full w-full max-w-md animate-slide-in-right bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 p-6">
                <div>
                  <h2 className="text-xl font-bold text-ink">Recent Transactions</h2>
                  <p className="text-xs text-slate-500">Last 20 sales at this store</p>
                </div>
                <button onClick={() => setHistoryOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {historyLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <History size={40} className="animate-spin opacity-20" />
                    <p className="mt-4 font-semibold uppercase tracking-widest text-[10px]">Loading history...</p>
                  </div>
                ) : recentSales.length > 0 ? (
                  recentSales.map((sale) => (
                    <div key={sale.id} className="group rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:border-brand-100 hover:shadow-soft">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-bold text-ink">{sale.sale_number}</p>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase">{new Date(sale.created_at).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-brand-600">{rwf(sale.total_amount)}</p>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            sale.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                          }`}>
                            {sale.payment_status}
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button 
                          onClick={() => openReturnModal(sale)}
                          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-50 py-2 text-xs font-bold text-amber-600 hover:bg-amber-100"
                        >
                          <RotateCcw size={14} /> Process Refund
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-20 text-center text-slate-400">
                    <ShoppingBag size={40} className="mx-auto opacity-20" />
                    <p className="mt-4">No recent transactions found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POS RETURN MODAL */}
      {returnModalOpen && returnSale && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-md">
          <div className="w-full max-w-lg overflow-hidden rounded-[2.5rem] bg-white shadow-2xl animate-scale-in">
            <div className="bg-amber-500 p-8 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-white/80">
                    <RotateCcw size={16} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Transaction Refund</span>
                  </div>
                  <h2 className="mt-2 text-3xl font-black">{returnSale.sale_number}</h2>
                </div>
                <button onClick={() => setReturnModalOpen(false)} className="rounded-full bg-white/20 p-2 text-white hover:bg-white/30">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-8 space-y-6">
              <div className="space-y-3">
                {returnItems.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-4 rounded-3xl border border-slate-100 bg-slate-50 p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-bold text-ink">{item.product_name}</p>
                        <p className="text-xs text-slate-400">{rwf(item.unit_price)} / unit</p>
                      </div>
                      <div className="text-right">
                         <p className="text-xs font-bold text-amber-600">{rwf(item.unit_price * item.quantity)}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between gap-4 border-t border-slate-200/50 pt-4">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer">
                        <div className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition ${
                          item.restock ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300 bg-white"
                        }`}>
                          {item.restock && <Plus size={12} strokeWidth={3} />}
                        </div>
                        <input type="checkbox" className="hidden" checked={item.restock} onChange={(e) => {
                          const ns = [...returnItems]; ns[idx].restock = e.target.checked; setReturnItems(ns);
                        }} />
                        Restock Inventory
                      </label>
                      
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => { const ns = [...returnItems]; ns[idx].quantity = Math.max(0, ns[idx].quantity - 1); setReturnItems(ns); }}
                          className="h-8 w-8 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center text-lg font-black">{item.quantity}</span>
                        <button 
                          onClick={() => { 
                            const max = (returnSale?.sale_items || []).find((s: any) => s.id === item.sale_item_id)?.quantity ?? item.quantity;
                            const ns = [...returnItems]; ns[idx].quantity = Math.min(max, ns[idx].quantity + 1); setReturnItems(ns); 
                          }}
                          className="h-8 w-8 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-emerald-500"
                        >
                          <Plus size={14} />
                        </button>
                        <span className="text-[10px] font-bold text-slate-300 uppercase">/ { (returnSale?.sale_items || []).find((s: any) => s.id === item.sale_item_id)?.quantity } max</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[2rem] bg-slate-900 p-6 text-white shadow-xl">
                 <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Total Refund Due</p>
                      <p className="mt-1 text-3xl font-black text-amber-400">
                        {rwf(returnItems.reduce((s, i) => s + i.unit_price * i.quantity, 0))}
                      </p>
                    </div>
                    <div className="h-14 w-14 rounded-2xl bg-white/10 flex items-center justify-center">
                       <Wallet size={24} className="text-white/40" />
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Refund Method</label>
                    <select value={returnRefundMethod} onChange={(e) => setReturnRefundMethod(e.target.value)} className="w-full rounded-2xl bg-slate-50 p-4 font-bold outline-none border border-slate-100">
                      <option value="cash">Cash</option>
                      <option value="momo">MoMo</option>
                      <option value="bank">Bank Transfer</option>
                    </select>
                 </div>
                 <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Reason</label>
                    <select value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="w-full rounded-2xl bg-slate-50 p-4 font-bold outline-none border border-slate-100">
                      <option value="">Select Reason</option>
                      <option value="damaged">Damaged Item</option>
                      <option value="wrong">Wrong Item</option>
                      <option value="change">Changed Mind</option>
                    </select>
                 </div>
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 flex gap-4">
              <button 
                onClick={() => setReturnModalOpen(false)}
                className="flex-1 rounded-2xl py-4 font-bold text-slate-400 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmReturn}
                disabled={processingReturn || returnItems.reduce((s,i) => s + i.quantity, 0) === 0}
                className="flex-[2] rounded-2xl bg-amber-500 py-4 font-bold text-white shadow-xl shadow-amber-200/50 hover:bg-amber-600 disabled:opacity-20 transition active:scale-95"
              >
                {processingReturn ? "Processing..." : "Confirm Refund"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
