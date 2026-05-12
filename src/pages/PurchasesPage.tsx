import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CalendarClock, CreditCard, Pencil, Plus, Printer, Search, Trash2, X } from "lucide-react";
import { formatCurrency } from "../lib/format";

import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { SectionCard } from "../components/ui/SectionCard";
import { Pagination } from "../components/ui/Pagination";
import { QuickAddProductModal } from "../components/ui/QuickAddProductModal";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { addPurchasePayment, createPurchase, deletePurchase, listPurchases, updatePurchase, updatePurchaseStatus, type PurchaseSummary } from "../services/purchaseService";
import { listProducts } from "../services/productService";
import { listSuppliers, createSupplier } from "../services/supplierService";
import { listLocations, getShopSettingsRecord } from "../services/settingsService";
import { useSettings } from "../hooks/useSettings";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import {
  listPaymentSchedules,
  createPaymentSchedule,
  markSchedulePaid,
  deletePaymentSchedule,
  autoMarkOverdue,
  type PaymentSchedule,
} from "../services/paymentScheduleService";
import type { PaymentMethod } from "../types/database";

type PaymentStatus = "Paid" | "Due" | "Partially Paid";
type DeliveryStatus = "Pending" | "Received";

type PurchaseLine = {
  id: string;
  productId: string;
  product: string;
  barcode?: string | null;
  quantity: number;
  purchasePrice: number;
  profitPercentage: number;
  sellingPrice: number;
};

type PurchaseRow = PurchaseSummary;

type PurchaseFormState = {
  id?: string;
  supplier: string;
  location: string;
  paymentStatus: PaymentStatus;
  paidAmount: string;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  deliveryStatus: DeliveryStatus;
  date: string;
  items: PurchaseLine[];
};

// Removed hardcoded companyInfo - now using useSettings() hook

const createEmptyForm = (): PurchaseFormState => ({
  supplier: "",
  location: "",
  paymentStatus: "Due",
  paidAmount: "",
  paymentMethod: "cash",
  paymentDate: new Date().toISOString().split("T")[0],
  deliveryStatus: "Pending",
  date: new Date().toISOString().split("T")[0],
  items: [],
});

function formatMoney(value: number) {
  return formatCurrency(value);
}

function lineTotal(item: PurchaseLine) {
  return item.quantity * item.purchasePrice;
}

function getScheduleDaysLeft(dueDate: string) {
  const [year, month, day] = dueDate.split("-").map(Number);
  const due = new Date(year, month - 1, day);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return Math.round((due.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
}

function formatScheduleCountdown(dueDate: string) {
  const daysLeft = getScheduleDaysLeft(dueDate);

  if (daysLeft < 0) {
    const overdueDays = Math.abs(daysLeft);
    return {
      label: `${overdueDays} ${overdueDays === 1 ? "day" : "days"} overdue`,
      tone: "overdue" as const,
    };
  }

  if (daysLeft === 0) {
    return { label: "Due today", tone: "today" as const };
  }

  if (daysLeft === 1) {
    return { label: "1 day left", tone: "soon" as const };
  }

  return {
    label: `${daysLeft} days left`,
    tone: daysLeft <= 3 ? ("soon" as const) : ("upcoming" as const),
  };
}

export function PurchasesPage() {
  const { t } = useTranslation();
  const { can, business } = useAuth();

  const { showToast, confirm } = useNotification();
  const { settings } = useSettings();
  const [search, setSearch] = useState("");
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseRow | null>(null);
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [productOptions, setProductOptions] = useState<PurchaseLine[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [supplierObjects, setSupplierObjects] = useState<{id: string; name: string}[]>([]);
  const [locationOptions, setLocationOptions] = useState<Array<{id: string, name: string}>>([]);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState>(createEmptyForm);
  const [productSearch, setProductSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierMenuOpen, setSupplierMenuOpen] = useState(false);
  const [productFocus, setProductFocus] = useState(false);
  const [statusPopup, setStatusPopup] = useState<{ id: string; type: "payment" | "delivery"; anchor: DOMRect } | null>(null);
  const [quickProductOpen, setQuickProductOpen] = useState(false);
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [newSupplierContact, setNewSupplierContact] = useState("");
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const ITEMS_PER_PAGE = 10;
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Payment schedule state
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [schedulePurchase, setSchedulePurchase] = useState<PurchaseRow | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleAmount, setScheduleAmount] = useState("");
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [showScheduleList, setShowScheduleList] = useState(false);
  const [paymentPurchase, setPaymentPurchase] = useState<PurchaseRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [savingPayment, setSavingPayment] = useState(false);

  const { run } = useAsyncAction();

  useRealtimeSync({
    onPurchaseCreated: () => void loadPage(),
    onProductChanged: () => void loadPage(),
    onSupplierChanged: () => void loadPage(),
    onLocationChanged: () => void loadPage(),
  });

  async function handleQuickAddSupplier() {
    if (!newSupplierName.trim()) return;
    try {
      setSavingSupplier(true);
      const created = await createSupplier({
        name: newSupplierName.trim(),
        contact_name: newSupplierContact.trim(),
        phone: newSupplierPhone.trim(),
        email: "",
        address: "",
      }, business?.id || "");
      // Update local options - proper state, no window hacks
      setSupplierOptions(prev => [...prev, created.name]);
      setSupplierObjects(prev => [...prev, { id: created.id, name: created.name }]);
      setPurchaseForm(f => ({ ...f, supplier: created.name }));
      setSupplierSearch(created.name);
      setQuickSupplierOpen(false);
      setNewSupplierName("");
      setNewSupplierPhone("");
      setNewSupplierContact("");
      showToast("success", t('suppliers.success.created'));
    } catch (err: any) {
      showToast("error", t('common.error'));
    } finally {
      setSavingSupplier(false);
    }
  }

  const loadPage = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [{ data: purchases, count }, products, suppliers, locations] = await Promise.all([
        listPurchases({ page: currentPage, pageSize: ITEMS_PER_PAGE, search: search }),
        listProducts(),
        listSuppliers(),
        listLocations(),
      ]);

      setRows(purchases);
      setTotalCount(count);
    
    // Load payment schedules too
    try {
      await autoMarkOverdue();
      const sched = await listPaymentSchedules();
      setSchedules(sched);
    } catch { /* non-critical */ }
    
    // Helper to map products to options
    const options = products.map((product) => {
      const cost = Number(product.cost_price || 0);
      const price = Number(product.selling_price || 0);
      const profit = cost > 0 ? Math.round(((price - cost) / cost) * 100) : 0;
      
      return {
        id: product.id,
        productId: product.id,
        product: product.name,
        barcode: product.barcode,
        quantity: 1,
        purchasePrice: cost,
        sellingPrice: price,
        profitPercentage: profit,
      };
    });

    if (products.length === 0) {
      console.warn("PurchasesPage: No products found. Search will not return results until products are added.");
    }
    setProductOptions(options);

    // Store supplier objects in proper React state (not window)
    const suppliersList = suppliers.map((s) => ({ id: s.id, name: s.name }));
    setSupplierOptions(suppliersList.map(s => s.name));
    setSupplierObjects(suppliersList);

    // Set location options
    setLocationOptions(locations);

    setPurchaseForm((current) => ({
      ...current,
      supplier: suppliers[0]?.name || "",
      location: locations[0]?.name || "",
    }));
    } catch (error) {
      console.error("Failed to load purchases:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run(loadPage);
  }, [run, currentPage, search]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const paginatedRows = rows;

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!productOptions || productOptions.length === 0) return [];
    
    if (!query) {
      return productOptions.slice(0, 10);
    }
    
    return productOptions
      .filter(
        (product) =>
          String(product.product || "").toLowerCase().includes(query) ||
          String(product.barcode || "").toLowerCase().includes(query),
      )
      .slice(0, 30);
  }, [productOptions, productSearch]);

  const filteredSuppliers = useMemo(() => {
    const query = supplierSearch.trim().toLowerCase();
    if (!query) return supplierOptions;
    return supplierOptions.filter((supplier) => supplier.toLowerCase().includes(query));
  }, [supplierOptions, supplierSearch]);

  const purchaseTotal = useMemo(() => {
    return purchaseForm.items.reduce((sum, item) => sum + lineTotal(item), 0);
  }, [purchaseForm.items]);

  async function updatePaymentStatus(id: string, status: PaymentStatus) {
    try {
      await run(async () => {
        const supplierName = rows.find(r => r.id === id)?.supplier;
        const supplierId = supplierObjects.find(s => s.name === supplierName)?.id ?? "";
        
        await updatePurchase(id, {
          supplier_id: supplierId,
          total_cost: Number(rows.find(r => r.id === id)?.amount.replace(/[$,]/g, '') || 0),
          payment_status: mapPaymentStatusToDb(status),
        });
        setRows((current) => current.map((row) => (row.id === id ? { ...row, paymentStatus: status } : row)));
      });
    } catch (error) {
      console.error("Failed to update payment status:", error);
    }
  }

  async function updateDeliveryStatus(id: string, status: DeliveryStatus) {
    try {
      await run(async () => {
        await updatePurchaseStatus(id, "delivery_status", status.toLowerCase());
        setRows((current) => current.map((row) => (row.id === id ? { ...row, deliveryStatus: status } : row)));
        showToast("success", t('purchases.success.delivery_marked', { status: t(`purchases.delivery.${status.toLowerCase()}`) }));
      });
    } catch (error) {
      console.error("Failed to update delivery status:", error);
      showToast("error", t('purchases.errors.delivery_failed'));
    }
  }

  async function handleDeletePurchase(id: string) {
    const confirmed = await confirm(t('purchases.modal.delete_title'), t('purchases.modal.delete_desc'));
    if (!confirmed) return;

    try {
      await run(async () => {
        await deletePurchase(id);
        setRows((current) => current.filter((row) => row.id !== id));
        if (selectedPurchase?.id === id) {
          setSelectedPurchase(null);
        }
        showToast("success", t('purchases.success.deleted'));
      });
    } catch (error) {
      console.error("Failed to delete purchase:", error);
    }
  }

  function openCreateModal() {
    setPurchaseForm(createEmptyForm());
    setProductSearch("");
    setSupplierSearch("");
    setSupplierMenuOpen(false);
    setProductFocus(false);
    setPurchaseModalOpen(true);
    // Refresh products on open
    run(loadPage);
  }

  function openEditModal(row: PurchaseRow) {
    setPurchaseForm({
      id: row.id,
      supplier: row.supplier,
      location: row.location,
      paymentStatus: row.paymentStatus,
      paidAmount: row.paidAmount ? String(row.paidAmount) : "",
      paymentMethod: "cash",
      paymentDate: new Date().toISOString().split("T")[0],
      deliveryStatus: row.deliveryStatus,
      date: row.date,
      items: row.items,
    });
    setProductSearch("");
    setSupplierSearch(row.supplier);
    setSupplierMenuOpen(false);
    setPurchaseModalOpen(true);
    // Refresh products on open
    run(loadPage);
  }

  function buildLine(productId: string): PurchaseLine | null {
    const product = productOptions.find((entry) => entry.productId === productId);
    if (!product) return null;
    
    // Use shop settings profit percentage if available, fallback to product profit or 25% (new default)
    const defaultProfit = settings?.default_profit_percentage ?? product.profitPercentage ?? 25;
    
    return {
      id: `${product.productId}-${Date.now()}`,
      productId: product.productId,
      product: product.product,
      barcode: product.barcode,
      quantity: 1,
      purchasePrice: product.purchasePrice,
      sellingPrice: Number((product.purchasePrice + (product.purchasePrice * defaultProfit / 100)).toFixed(2)),
      profitPercentage: defaultProfit,
    };
  }

  function handleProductKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && filteredProducts.length > 0) {
      e.preventDefault();
      addPurchaseProduct(filteredProducts[0].productId);
    }
  }

  function recalculateLine(
    item: PurchaseLine,
    field: keyof Omit<PurchaseLine, "id" | "product" | "productId">,
    value: number,
  ): PurchaseLine {
    const nextItem: PurchaseLine = {
      ...item,
      [field]: value,
    } as PurchaseLine;

    if (field === "purchasePrice" || field === "profitPercentage") {
      nextItem.sellingPrice = Number(
        (nextItem.purchasePrice + (nextItem.purchasePrice * nextItem.profitPercentage) / 100).toFixed(2),
      );
    }

    if (field === "sellingPrice" && nextItem.purchasePrice > 0) {
      nextItem.profitPercentage = Number(
        (((nextItem.sellingPrice - nextItem.purchasePrice) / nextItem.purchasePrice) * 100).toFixed(1),
      );
    }

    return nextItem;
  }

  function addPurchaseProduct(productId: string) {
    const line = buildLine(productId);
    if (!line) return;
    setPurchaseForm((current) => {
      if (current.items.some((item) => item.productId === productId)) return current;
      return { ...current, items: [...current.items, line] };
    });
    setProductSearch("");
    // refocus for fast entry
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  function mapPaymentStatusToDb(status: string): "paid" | "unpaid" | "partial" {
    if (status === "Paid") return "paid";
    if (status === "Partially Paid") return "partial";
    return "unpaid"; // Due -> unpaid
  }

  function openPaymentModal(row: PurchaseRow, amount = row.remainingAmount) {
    setPaymentPurchase(row);
    setPaymentAmount(String(Math.max(0, Math.round(amount))));
    setPaymentMethod("cash");
    setPaymentDate(new Date().toISOString().split("T")[0]);
  }

  async function handleRecordPurchasePayment() {
    if (!paymentPurchase || !paymentAmount) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("error", "Enter a valid payment amount.");
      return;
    }
    if (amount > paymentPurchase.remainingAmount) {
      showToast("error", "Payment cannot be more than the remaining balance.");
      return;
    }

    try {
      setSavingPayment(true);
      await addPurchasePayment(paymentPurchase.id, paymentMethod, amount, paymentDate);
      setPaymentPurchase(null);
      setPaymentAmount("");
      await loadPage();
      showToast("success", "Supplier payment recorded.");
    } catch (error: any) {
      showToast("error", error?.message || "Failed to record supplier payment.");
    } finally {
      setSavingPayment(false);
    }
  }

  async function savePurchase() {
    if (!purchaseForm.items.length) return;

    const supplierId = supplierObjects.find(s => s.name === purchaseForm.supplier)?.id;
    if (!supplierId) {
      showToast("warning", t('purchases.errors.select_supplier'));
      return;
    }

    const locationId = locationOptions.find(l => l.name === purchaseForm.location)?.id;
    if (!locationId) {
      showToast("warning", t('purchases.errors.select_location'));
      return;
    }

    await run(async () => {
      try {
        const initialPaidAmount =
          purchaseForm.paymentStatus === "Paid"
            ? purchaseTotal
            : purchaseForm.paymentStatus === "Partially Paid"
              ? Number(purchaseForm.paidAmount || 0)
              : 0;

        if (purchaseForm.paymentStatus === "Partially Paid" && (initialPaidAmount <= 0 || initialPaidAmount >= purchaseTotal)) {
          showToast("warning", "Partial payment must be more than 0 and less than the total.");
          return;
        }

        if (purchaseForm.id) {
          await updatePurchase(purchaseForm.id, {
            supplier_id: supplierId,
            total_cost: purchaseTotal,
            payment_status: mapPaymentStatusToDb(purchaseForm.paymentStatus),
          });
        } else {
          await createPurchase({
            supplier_id: supplierId,
            location_id: locationId,
            total_cost: purchaseTotal,
            payment_status: mapPaymentStatusToDb(purchaseForm.paymentStatus),
            paid_amount: initialPaidAmount,
            payment_method: purchaseForm.paymentMethod,
            paid_at: purchaseForm.paymentDate,
            items: purchaseForm.items.map(item => ({
              product_id: item.productId,
              quantity: item.quantity,
              cost_price: item.purchasePrice,
              selling_price: item.sellingPrice
            })),
          });
        }
        
        // Refresh full list to get correct IDs and formatted data from DB
        const purchases = await listPurchases({ page: currentPage, pageSize: ITEMS_PER_PAGE, search: search });
        setRows(purchases.data);
        setTotalCount(purchases.count);
        showToast("success", purchaseForm.id ? t('purchases.success.updated') : t('purchases.success.created'));
        setPurchaseModalOpen(false);
        setPurchaseForm(createEmptyForm());
      } catch (error: any) {
        const msg = error?.message || JSON.stringify(error);
        showToast("error", t('purchases.errors.save_failed', { error: msg }));
        console.error("Failed to save purchase:", error);
      }
    });
  }

  const noResults = rows.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">{t('purchases.title')}</p>
          <h1 className="mt-3 text-3xl font-bold text-ink">{t('purchases.title')}</h1>
          <p className="mt-2 text-sm text-slate-500">{t('purchases.subtitle')}</p>
        </div>

        {can("Purchases", "add") && (
          <button onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700">
            <Plus size={18} /> {t('purchases.new_purchase')}
          </button>
        )}
      </div>


      <SectionCard title={t('purchases.title')} subtitle={t('purchases.subtitle')}>
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
            <Search size={16} className="text-brand-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full border-none bg-transparent text-sm outline-none"
              placeholder={t('purchases.search_placeholder')}
            />
          </label>
        </div>


        <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-[0_20px_50px_rgba(37,99,235,0.08)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                <tr>
                  {[
                    t('purchases.table.order'),
                    t('purchases.table.supplier'),
                    t('purchases.table.location'),
                    t('purchases.table.amount'),
                    t('purchases.table.status'),
                    t('purchases.table.delivery'),
                    t('purchases.table.date'),
                    t('common.actions'),
                  ].map((column) => (
                    <th key={column} className="border-b border-white/10 px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-100">
                      {column}
                    </th>
                  ))}

                </tr>
              </thead>
              <tbody className="bg-white relative">
                {/* Loading overlay */}
                {loading && rows.length > 0 && (
                  <tr className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
                    <td colSpan={8} className="h-full w-full flex items-center justify-center py-20">
                       <div className="flex flex-col items-center gap-3">
                          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600"></div>
                          <p className="text-xs font-bold uppercase tracking-widest text-brand-700">{t('common.processing')}</p>
                       </div>
                    </td>
                  </tr>
                )}

                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-20 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-4">
                        <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600"></div>
                        <p className="font-semibold">{t('common.loading')}</p>
                      </div>
                    </td>
                  </tr>
                ) : noResults ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-slate-500">
                      {t('purchases.no_purchases')}
                    </td>
                  </tr>
                ) : (

                  paginatedRows.map((row) => (
                    <tr key={row.id} className="transition hover:bg-brand-50/40">
                      <td className="border-b border-slate-100 px-4 py-3">
                         <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm ring-1 ring-white/10 shrink-0">
                               <span className="text-[10px] font-black">{row.purchaseNumber ? "PO" : "ID"}</span>
                            </div>
                            <p className="font-bold text-ink text-xs truncate">
                               {row.purchaseNumber ? `#${row.purchaseNumber}` : `${row.id.substring(0, 8)}…`}
                            </p>
                         </div>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-700 font-medium text-sm truncate max-w-[150px]" title={row.supplier}>{row.supplier}</td>
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-500 text-sm truncate max-w-[120px]" title={row.location}>{row.location}</td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <p className="font-bold text-brand-600 text-sm">{row.amount}</p>
                        {row.paidAmount > 0 && (
                          <div className="mt-1 space-y-0.5 text-[10px] font-semibold">
                            <p className="text-emerald-600">Paid: {formatMoney(row.paidAmount)}</p>
                            <p className={row.remainingAmount > 0 ? "text-amber-600" : "text-slate-400"}>
                              Left: {formatMoney(row.remainingAmount)}
                            </p>
                            {row.lastPaymentDate && (
                              <p className="text-slate-400">Last: {new Date(row.lastPaymentDate).toLocaleDateString()}</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <button
                          onClick={(e) => setStatusPopup({ id: row.id, type: "payment", anchor: e.currentTarget.getBoundingClientRect() })}
                          className={`rounded-full px-3 py-1 text-[11px] font-bold ring-1 transition hover:brightness-95 cursor-pointer ${
                            row.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' :
                            row.paymentStatus === 'Partially Paid' ? 'bg-sky-50 text-sky-600 ring-sky-100' :
                            'bg-amber-50 text-amber-600 ring-amber-100'
                          }`}
                        >
                          {row.paymentStatus === "Paid" ? t('purchases.status.paid') :
                           row.paymentStatus === "Partially Paid" ? t('purchases.status.partial') :
                           t('purchases.status.due')} ▾
                        </button>

                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <button
                          onClick={(e) => setStatusPopup({ id: row.id, type: "delivery", anchor: e.currentTarget.getBoundingClientRect() })}
                          className={`rounded-full px-3 py-1 text-[11px] font-bold ring-1 transition hover:brightness-95 cursor-pointer ${
                            row.deliveryStatus === 'Received' ? 'bg-indigo-50 text-indigo-600 ring-indigo-100' :
                            'bg-slate-50 text-slate-500 ring-slate-100'
                          }`}
                        >
                          {row.deliveryStatus === "Received" ? t('purchases.delivery.received') : t('purchases.delivery.pending')} ▾
                        </button>

                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-500 text-sm">{row.date}</td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {can("Purchases", "edit") && (
                            <button onClick={() => openEditModal(row)} className="rounded-lg bg-sky-50 p-1.5 text-sky-600 transition hover:bg-sky-100" title="Edit">
                              <Pencil size={14} />
                            </button>
                          )}
                          <button onClick={() => setSelectedPurchase(row)} className="rounded-lg bg-brand-50 p-1.5 text-brand-600 transition hover:bg-brand-100" title="Invoice">
                            <Printer size={14} />
                          </button>
                          {can("Purchases", "edit") && row.paymentStatus !== "Paid" && (
                            <button onClick={() => openPaymentModal(row)} className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 transition hover:bg-emerald-100" title="Record Payment">
                              <CreditCard size={14} />
                            </button>
                          )}
                          {can("Purchases", "edit") && row.paymentStatus !== "Paid" && (
                            <button
                              onClick={() => {
                                setSchedulePurchase(row);
                                setScheduleAmount(String(Math.round(row.remainingAmount || row.totalCost)));
                                setScheduleDate(new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]);
                                setScheduleNotes("");
                                setScheduleModalOpen(true);
                              }}
                              className="rounded-lg bg-amber-50 p-1.5 text-amber-600 transition hover:bg-amber-100"
                              title="Schedule Payment"
                            >
                              <CalendarClock size={14} />
                            </button>
                          )}
                          {can("Purchases", "delete") && (
                            <button onClick={() => handleDeletePurchase(row.id)} className="rounded-lg bg-rose-50 p-1.5 text-rose-600 transition hover:bg-rose-100" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalCount}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setCurrentPage}
          />
        </div>
      </SectionCard>

      {/* Status Update Popup */}
      {statusPopup && can("Purchases", "edit") && (
        <div className="fixed inset-0 z-[80]" onClick={() => setStatusPopup(null)}>
          <div
            className="absolute rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl min-w-[180px]"
            style={{ top: statusPopup.anchor.bottom + 8, left: statusPopup.anchor.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1">
              {statusPopup.type === "payment" ? t('purchases.table.status') : t('purchases.table.delivery')}
            </p>

            {statusPopup.type === "payment" ? (
              <div className="grid gap-1">
                {(["paid", "unpaid", "partial"] as const).map((val) => {
                  const label = t(`purchases.status.${val}`);
                  const colors = val === "paid" ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : val === "partial" ? "bg-sky-50 text-sky-700 hover:bg-sky-100" : "bg-amber-50 text-amber-700 hover:bg-amber-100";
                  return (
                    <button
                      key={val}
                      onClick={async () => {
                        const row = rows.find((item) => item.id === statusPopup.id);
                        setStatusPopup(null);
                        if (val === "unpaid") {
                          if (row && row.paidAmount > 0) {
                            showToast("warning", "This purchase already has payments recorded.");
                            return;
                          }
                          await updatePurchaseStatus(statusPopup.id, "payment_status", val);
                          run(loadPage);
                          return;
                        }
                        if (row) {
                          openPaymentModal(row, val === "paid" ? row.remainingAmount : Math.max(1, row.remainingAmount));
                        }
                      }}
                      className={`w-full rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${colors}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-1">
                {(["pending", "received"] as const).map((val) => {
                  const label = val === "received" ? t('purchases.delivery.received') : t('purchases.delivery.pending');
                  const colors = val === "received" ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" : "bg-slate-50 text-slate-600 hover:bg-slate-100";
                  return (
                    <button
                      key={val}
                      onClick={async () => {
                        await updatePurchaseStatus(statusPopup.id, "delivery_status", val);
                        setStatusPopup(null);
                        run(loadPage);
                      }}
                      className={`w-full rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${colors}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

            )}
          </div>
        </div>
      )}

      {/* Create/Edit Purchase Modal */}
      {purchaseModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setPurchaseModalOpen(false)}>
          <div className="w-full max-w-4xl rounded-[2rem] bg-white p-8 shadow-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-ink">
                  {purchaseForm.id ? t('purchases.modal.edit_title') : t('purchases.modal.create_title')}
                </h2>
                <p className="text-sm text-slate-500 mt-1">{t('purchases.modal.subtitle')}</p>
              </div>

              <button
                onClick={() => setPurchaseModalOpen(false)}
                className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
              >
                <X size={20} />
              </button>
            </div>

            {/* Compact controls bar */}
            <div className="grid gap-3 md:grid-cols-6 mb-4">
              {/* Supplier */}
              <div className="relative md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">{t('purchases.modal.supplier')}</label>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={(e) => { setSupplierSearch(e.target.value); setSupplierMenuOpen(true); }}
                    onFocus={() => setSupplierMenuOpen(true)}
                    placeholder={t('purchases.modal.search_suppliers')}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 transition"
                  />
                </div>

                {supplierMenuOpen && (
                  <div className="absolute left-0 right-0 top-full z-[70] mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                    {filteredSuppliers.length > 0 ? (
                      filteredSuppliers.map((s) => (
                        <button
                          key={s}
                          onMouseDown={(e) => { e.preventDefault(); setPurchaseForm({ ...purchaseForm, supplier: s }); setSupplierSearch(s); setSupplierMenuOpen(false); }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 transition"
                        >{s}</button>
                      ))
                    ) : (
                      <div className="px-3 py-2">
                        <p className="text-xs text-slate-400 mb-2">
                          {t('purchases.modal.no_supplier_found', { query: supplierSearch })}
                        </p>
                        <button
                          onMouseDown={(e) => { e.preventDefault(); setNewSupplierName(supplierSearch); setQuickSupplierOpen(true); setSupplierMenuOpen(false); }}
                          className="flex w-full items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 transition"
                        >
                          <Plus size={14} /> {t('purchases.modal.add_as_supplier', { query: supplierSearch })}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">{t('purchases.modal.location')}</label>
                <select
                  value={purchaseForm.location}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, location: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-brand-500 transition"
                >
                  <option value="" disabled>{t('common.select')}</option>

                  {locationOptions.map((location) => (
                    <option key={location.id} value={location.name}>{location.name}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">{t('purchases.modal.date')}</label>

                <input
                  type="date"
                  value={purchaseForm.date}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, date: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-brand-500 transition"
                />
              </div>

              {/* Payment */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">{t('purchases.modal.payment')}</label>
                <select
                  value={purchaseForm.paymentStatus}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, paymentStatus: e.target.value as PaymentStatus, paidAmount: e.target.value === "Due" ? "" : purchaseForm.paidAmount })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-brand-500 transition"
                >
                  <option value="Paid">{t('purchases.status.paid')}</option>
                  <option value="Due">{t('purchases.status.due')}</option>
                  <option value="Partially Paid">{t('purchases.status.partial')}</option>
                </select>
              </div>

              {purchaseForm.paymentStatus !== "Due" && (
                <>
                  {purchaseForm.paymentStatus === "Partially Paid" && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Paid amount</label>
                      <input
                        type="number"
                        min="0"
                        max={purchaseTotal || undefined}
                        value={purchaseForm.paidAmount}
                        onChange={(e) => setPurchaseForm({ ...purchaseForm, paidAmount: e.target.value })}
                        className="w-full rounded-xl border border-emerald-100 bg-emerald-50 py-2 px-3 text-sm font-bold text-emerald-700 outline-none focus:border-emerald-500 transition"
                        placeholder="Amount already paid"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Payment method</label>
                    <select
                      value={purchaseForm.paymentMethod}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, paymentMethod: e.target.value as PaymentMethod })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-brand-500 transition"
                    >
                      <option value="cash">Cash</option>
                      <option value="momo">Momo</option>
                      <option value="card">Card</option>
                      <option value="bank">Bank</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Payment date</label>
                    <input
                      type="date"
                      value={purchaseForm.paymentDate}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, paymentDate: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-brand-500 transition"
                    />
                  </div>
                </>
              )}


              {/* Delivery */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">{t('purchases.modal.delivery')}</label>
                <select
                  value={purchaseForm.deliveryStatus}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, deliveryStatus: e.target.value as DeliveryStatus })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-brand-500 transition"
                >
                  <option value="Pending">{t('purchases.delivery.pending')}</option>
                  <option value="Received">{t('purchases.delivery.received')}</option>
                </select>
              </div>

            </div>

            {/* Product search bar */}
            <div className="mb-3">
               <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">{t('purchases.modal.add_product')}</label>

                  <div className="relative flex gap-2">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        onFocus={() => setProductFocus(true)}
                        onBlur={() => setTimeout(() => setProductFocus(false), 200)}
                        onKeyDown={handleProductKeyDown}
                        placeholder={t('purchases.modal.search_products')}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-brand-500 transition shadow-sm"
                      />

                    </div>
                    <button
                      type="button"
                      onClick={() => setQuickProductOpen(true)}
                      className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-soft transition hover:scale-105 active:scale-95"
                      title="Quick Add Product"
                    >
                      <Plus size={22} />
                    </button>
                    {productSearch.trim() && (
                      <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[200] rounded-2xl border border-slate-200 bg-white shadow-xl max-h-64 overflow-y-auto">
                        {filteredProducts.length > 0 ? (
                          filteredProducts.map((p) => (
                            <button
                              key={p.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                addPurchaseProduct(p.productId);
                              }}
                              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-brand-50 transition border-b border-slate-100 last:border-0"
                            >
                              <div className="min-w-0 flex-1 pr-4">
                                <p className="font-semibold text-slate-800 truncate text-sm">{p.product}</p>
                                <p className="text-xs text-slate-400">{p.barcode || t('common.no_barcode')}</p>

                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-sm font-bold text-brand-600">
                                  {formatMoney(p.sellingPrice)}
                                </span>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-6 text-center">
                            <p className="text-slate-400 text-sm">{t('purchases.modal.no_products_found', { query: productSearch })}</p>
                          </div>

                        )}
                      </div>
                    )}
                  </div>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 rounded-3xl border border-slate-100 overflow-hidden">
               <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                     <tr>
                        {[
                          t('purchases.modal.table.product'),
                          t('purchases.modal.table.qty'),
                          t('purchases.modal.table.cost'),
                          t('purchases.modal.table.profit'),
                          t('purchases.modal.table.selling'),
                          ""
                        ].map((col) => (
                           <th key={col} className="px-5 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-slate-100">
                              {col}
                           </th>
                        ))}
                     </tr>
                  </thead>
                  <tbody className="bg-white">
                     {purchaseForm.items.length === 0 ? (
                        <tr>
                           <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                              <Search size={24} className="mx-auto mb-3 opacity-20" />
                              {t('purchases.empty_search')}
                           </td>
                        </tr>
                     ) : (
                        purchaseForm.items.map((item, idx) => (
                           <tr key={item.id} className="transition hover:bg-slate-50">
                              <td className="border-b border-slate-100 px-5 py-4">
                                 <p className="font-semibold text-ink text-sm truncate max-w-[200px]">{item.product}</p>
                                 <p className="text-[10px] text-brand-600 font-bold">Total: {formatMoney(lineTotal(item))}</p>
                              </td>
                              <td className="border-b border-slate-100 px-5 py-4">
                                 <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => {
                                       const newItems = [...purchaseForm.items];
                                       newItems[idx] = recalculateLine(item, "quantity", Number(e.target.value));
                                       setPurchaseForm({ ...purchaseForm, items: newItems });
                                    }}
                                    className="w-24 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 font-bold"
                                 />
                              </td>
                              <td className="border-b border-slate-100 px-5 py-4">
                                 <input
                                    type="number"
                                    value={item.purchasePrice}
                                    onChange={(e) => {
                                       const newItems = [...purchaseForm.items];
                                       newItems[idx] = recalculateLine(item, "purchasePrice", Number(e.target.value));
                                       setPurchaseForm({ ...purchaseForm, items: newItems });
                                    }}
                                    className="w-28 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 font-bold"
                                 />
                              </td>
                              <td className="border-b border-slate-100 px-5 py-4">
                                 <input
                                    type="number"
                                    value={item.profitPercentage}
                                    onChange={(e) => {
                                       const newItems = [...purchaseForm.items];
                                       newItems[idx] = recalculateLine(item, "profitPercentage", Number(e.target.value));
                                       setPurchaseForm({ ...purchaseForm, items: newItems });
                                    }}
                                    className="w-24 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 px-3 py-2 text-sm outline-none focus:border-emerald-500 font-bold"
                                 />
                              </td>
                              <td className="border-b border-slate-100 px-5 py-4">
                                 <input
                                    type="number"
                                    value={item.sellingPrice}
                                    onChange={(e) => {
                                       const newItems = [...purchaseForm.items];
                                       newItems[idx] = recalculateLine(item, "sellingPrice", Number(e.target.value));
                                       setPurchaseForm({ ...purchaseForm, items: newItems });
                                    }}
                                    className="w-28 bg-brand-50 text-brand-700 rounded-xl border border-brand-100 px-3 py-2 text-sm outline-none focus:border-brand-500 font-bold"
                                 />
                              </td>
                              <td className="border-b border-slate-100 px-5 py-4">
                                 <button
                                    onClick={() => setPurchaseForm({ ...purchaseForm, items: purchaseForm.items.filter((_, i) => i !== idx) })}
                                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition"
                                 >
                                    <Trash2 size={18} />
                                 </button>
                              </td>
                           </tr>
                        ))
                     )}
                  </tbody>
               </table>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <p className="text-sm font-medium text-slate-500">{t('purchases.modal.order_summary')}</p>
                <h3 className="text-3xl font-black text-ink">{formatMoney(purchaseTotal)}</h3>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  onClick={() => setPurchaseModalOpen(false)}
                  className="flex-1 sm:flex-none py-4 px-8 rounded-2xl border border-slate-200 font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  {t('common.cancel')}

                </button>
                <button
                  onClick={savePurchase}
                  disabled={!purchaseForm.items.length || !purchaseForm.supplier}
                  className="flex-1 sm:flex-none py-4 px-8 rounded-2xl bg-brand-600 font-bold text-white transition hover:bg-brand-700 shadow-xl shadow-brand-100 disabled:opacity-50"
                >
                  {t('purchases.modal.save_purchase')}

                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print portal: renders print styles + invoice clone OUTSIDE #root so window.print() works */}
      {selectedPurchase && createPortal(
        <>
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body > #root { display: none !important; }
              body { margin: 0 !important; padding: 0 !important; background: white !important; }
              #purchase-invoice-print { display: block !important; width: 210mm; padding: 15mm; box-sizing: border-box; font-family: system-ui, sans-serif; }
              @page { size: A4; margin: 0; }
            }
            @media screen { #purchase-invoice-print { display: none; } }
          `}} />
          <div id="purchase-invoice-print">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#94a3b8', marginBottom: '4px' }}>{t('purchases.invoice.title')}</p>
                <p style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>{selectedPurchase.purchaseNumber ? `#${selectedPurchase.purchaseNumber}` : selectedPurchase.id.substring(0,8)}</p>
                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{selectedPurchase.date}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>{settings?.shop_name || 'RETAIL POS'}</p>
                <p style={{ fontSize: '11px', color: '#64748b' }}>{settings?.address || ''}</p>
                <p style={{ fontSize: '11px', color: '#64748b' }}>{settings?.contact_phone || ''}</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: '8px' }}>{t('purchases.invoice.supplier_info')}</p>
                <p style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{selectedPurchase.supplier}</p>
                <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{t('purchases.invoice.delivery_status')}: {selectedPurchase.deliveryStatus}</p>
                <p style={{ fontSize: '11px', color: '#64748b' }}>{t('purchases.invoice.location')}: {selectedPurchase.location}</p>
              </div>
              <div style={{ background: '#eff6ff', borderRadius: '8px', padding: '12px' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#93c5fd', marginBottom: '8px' }}>{t('purchases.invoice.payment_status')}</p>
                <p style={{ fontSize: '13px', fontWeight: 700, color: selectedPurchase.paymentStatus === 'Paid' ? '#059669' : selectedPurchase.paymentStatus === 'Partially Paid' ? '#0284c7' : '#d97706' }}>
                  {selectedPurchase.paymentStatus === 'Paid' ? t('purchases.status.paid') : selectedPurchase.paymentStatus === 'Partially Paid' ? t('purchases.status.partial') : t('purchases.status.due')}
                </p>
                <p style={{ fontSize: '20px', fontWeight: 900, color: '#1d4ed8', marginTop: '4px' }}>{selectedPurchase.amount}</p>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '20px' }}>
              <thead>
                <tr style={{ background: '#0f172a', color: 'white' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('purchases.invoice.product')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('purchases.invoice.price')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('purchases.invoice.qty')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('purchases.invoice.total')}</th>
                </tr>
              </thead>
              <tbody>
                {selectedPurchase.items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>{item.product}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569' }}>{formatMoney(item.purchasePrice)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>{item.quantity}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#1d4ed8' }}>{formatMoney(item.purchasePrice * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: '240px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '2px solid #0f172a', marginTop: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', color: '#0f172a' }}>{t('purchases.invoice.grand_total')}</span>
                  <span style={{ fontSize: '18px', fontWeight: 900, color: '#1d4ed8' }}>{selectedPurchase.amount}</span>
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* View/Print Invoice Modal */}
      {selectedPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 overflow-y-auto py-8 backdrop-blur-sm" onClick={() => setSelectedPurchase(null)}>
          <div className="w-full max-w-4xl rounded-[2rem] bg-white shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            {/* Header bar */}
            <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-brand-600">{t('purchases.invoice.title')}</p>
                <h2 className="text-2xl font-black text-ink mt-1">{selectedPurchase.purchaseNumber ? `#${selectedPurchase.purchaseNumber}` : selectedPurchase.id.substring(0,8)}</h2>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 shadow-lg"
                >
                  <Printer size={16} /> {t('purchases.invoice.print')}
                </button>
                <button onClick={() => setSelectedPurchase(null)} className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Invoice body (scrollable on screen) */}
            <div id="purchase-invoice" className="overflow-y-auto max-h-[75vh] p-8">
              {/* Business header */}
              <div className="mb-8 flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">{t('purchases.invoice.supplier_info')}</p>
                  <p className="text-xl font-black text-ink">{selectedPurchase.supplier}</p>
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">
                    <span className="text-xs font-semibold text-slate-600">{t('purchases.invoice.delivery_status')}: {selectedPurchase.deliveryStatus}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-ink uppercase tracking-wide">{settings?.shop_name || "RETAIL POS"}</p>
                  <p className="text-sm text-slate-500">{settings?.address || ""}</p>
                  <p className="text-sm text-slate-500">{settings?.contact_phone || ""}</p>
                </div>
              </div>

              {/* Two-column info cards */}
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                <div className="rounded-2xl bg-slate-50 p-5">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">{t('purchases.invoice.order_details')}</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">{t('purchases.invoice.po_number')}</span>
                      <span className="text-sm font-bold text-ink">{selectedPurchase.purchaseNumber ? `#${selectedPurchase.purchaseNumber}` : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">{t('purchases.invoice.purchase_date')}</span>
                      <span className="text-sm font-bold text-ink">{selectedPurchase.date}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">{t('purchases.invoice.location')}</span>
                      <span className="text-sm font-bold text-ink">{selectedPurchase.location}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl bg-brand-50 p-5">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-brand-400 mb-3">{t('purchases.invoice.payment_status')}</h4>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`rounded-full px-4 py-1.5 text-sm font-black ${
                      selectedPurchase.paymentStatus === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                      selectedPurchase.paymentStatus === 'Partially Paid' ? 'bg-sky-100 text-sky-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {selectedPurchase.paymentStatus === "Paid" ? t('purchases.status.paid') :
                       selectedPurchase.paymentStatus === "Partially Paid" ? t('purchases.status.partial') :
                       t('purchases.status.due')}
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-black text-brand-700">{selectedPurchase.amount}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold">
                    <div className="rounded-xl bg-white/70 px-3 py-2">
                      <p className="text-slate-400">Paid</p>
                      <p className="text-emerald-600">{formatMoney(selectedPurchase.paidAmount)}</p>
                    </div>
                    <div className="rounded-xl bg-white/70 px-3 py-2">
                      <p className="text-slate-400">Left</p>
                      <p className="text-amber-600">{formatMoney(selectedPurchase.remainingAmount)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items table */}
              <div className="overflow-hidden rounded-2xl border border-slate-100 mb-6">
                <table className="w-full text-left text-sm border-separate border-spacing-0">
                  <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                    <tr>
                      <th className="px-5 py-4 font-semibold uppercase tracking-wider text-xs">{t('purchases.invoice.product')}</th>
                      <th className="px-5 py-4 font-semibold uppercase tracking-wider text-xs text-right">{t('purchases.invoice.price')}</th>
                      <th className="px-5 py-4 font-semibold uppercase tracking-wider text-xs text-center">{t('purchases.invoice.qty')}</th>
                      <th className="px-5 py-4 font-semibold uppercase tracking-wider text-xs text-right">{t('purchases.invoice.total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPurchase.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition">
                        <td className="px-5 py-4 font-semibold text-ink">{item.product}</td>
                        <td className="px-5 py-4 text-right text-slate-600">{formatMoney(item.purchasePrice)}</td>
                        <td className="px-5 py-4 text-center font-bold text-slate-700">{item.quantity}</td>
                        <td className="px-5 py-4 text-right font-black text-brand-600">{formatMoney(item.purchasePrice * item.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-72 space-y-2">
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-slate-500">{t('purchases.invoice.subtotal')}</span>
                    <span className="font-bold text-ink">{selectedPurchase.amount}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-t-2 border-slate-200 mt-1">
                    <span className="text-base font-black text-ink uppercase tracking-wide">{t('purchases.invoice.grand_total')}</span>
                    <span className="text-2xl font-black text-brand-600">{selectedPurchase.amount}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* QUICK ADD PRODUCT MODAL */}
      <QuickAddProductModal 
        isOpen={quickProductOpen}
        onClose={() => setQuickProductOpen(false)}
        onSuccess={() => {
          // Re-load products in the purchase form list
          void loadPage();
        }}
      />

      {/* QUICK ADD SUPPLIER MODAL */}
      {quickSupplierOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm" onClick={() => setQuickSupplierOpen(false)}>
          <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-brand-600 mb-1">{t('purchases.quick_supplier.label')}</p>
                <h2 className="text-2xl font-bold text-ink">{t('purchases.quick_supplier.title')}</h2>
              </div>
              <button onClick={() => setQuickSupplierOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{t('purchases.quick_supplier.name')} *</label>
                <input type="text" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-brand-500 transition" placeholder={t('purchases.quick_supplier.name_placeholder')} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{t('purchases.quick_supplier.contact')}</label>
                <input type="text" value={newSupplierContact} onChange={(e) => setNewSupplierContact(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-brand-500 transition" placeholder={t('purchases.quick_supplier.contact_placeholder')} />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{t('purchases.quick_supplier.phone')}</label>
                <input type="text" value={newSupplierPhone} onChange={(e) => setNewSupplierPhone(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-brand-500 transition" placeholder={t('purchases.quick_supplier.phone_placeholder')} />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setQuickSupplierOpen(false)} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t('common.cancel')}</button>
              <button onClick={handleQuickAddSupplier} disabled={savingSupplier || !newSupplierName.trim()} className="flex-1 rounded-2xl bg-brand-600 py-3 text-sm font-bold text-white shadow-soft hover:bg-brand-700 transition disabled:opacity-50">
                {savingSupplier ? t('purchases.quick_supplier.saving') : t('purchases.quick_supplier.save_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Supplier Payment Modal */}
      {paymentPurchase && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm" onClick={() => setPaymentPurchase(null)}>
          <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-1">Supplier payment</p>
                <h2 className="text-xl font-bold text-ink">{paymentPurchase.supplier}</h2>
                <p className="text-sm text-slate-500 mt-1">{paymentPurchase.purchaseNumber ? `#${paymentPurchase.purchaseNumber}` : paymentPurchase.id.substring(0, 8)}</p>
              </div>
              <button onClick={() => setPaymentPurchase(null)} className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="mb-5 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-center text-xs font-bold">
              <div>
                <p className="text-slate-400">Total</p>
                <p className="text-slate-900">{formatMoney(paymentPurchase.totalCost)}</p>
              </div>
              <div>
                <p className="text-slate-400">Paid</p>
                <p className="text-emerald-600">{formatMoney(paymentPurchase.paidAmount)}</p>
              </div>
              <div>
                <p className="text-slate-400">Left</p>
                <p className="text-amber-600">{formatMoney(paymentPurchase.remainingAmount)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Amount paid</span>
                <input
                  type="number"
                  min="0"
                  max={paymentPurchase.remainingAmount}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold outline-none focus:border-emerald-500"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Payment method</span>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none">
                  <option value="cash">Cash</option>
                  <option value="momo">Momo</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Payment date</span>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-emerald-500"
                />
              </label>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setPaymentPurchase(null)} className="flex-1 rounded-2xl border border-slate-200 py-3 font-semibold text-slate-600 hover:bg-slate-50">{t('common.cancel')}</button>
              <button onClick={handleRecordPurchasePayment} disabled={savingPayment || !paymentAmount} className="flex-1 rounded-2xl bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">
                {savingPayment ? t('common.loading') : t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SCHEDULE PAYMENT MODAL ── */}
      {scheduleModalOpen && schedulePurchase && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm" onClick={() => setScheduleModalOpen(false)}>
          <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-1">{t('purchases.schedule.label')}</p>
                <h2 className="text-xl font-bold text-ink">{t('purchases.schedule.title')}</h2>
                <p className="text-sm text-slate-500 mt-1">{schedulePurchase.supplier}</p>
              </div>
              <button onClick={() => setScheduleModalOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{t('purchases.schedule.amount')} *</label>
                <input
                  type="number" min="0" value={scheduleAmount}
                  onChange={(e) => setScheduleAmount(e.target.value)}
                  className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-amber-400 transition"
                  placeholder={t('purchases.schedule.amount_placeholder')}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{t('purchases.schedule.due_date')} *</label>
                <input
                  type="date" value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-amber-400 transition"
                />
                {scheduleDate && (
                  <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                    formatScheduleCountdown(scheduleDate).tone === "overdue" ? "bg-rose-100 text-rose-700" :
                    formatScheduleCountdown(scheduleDate).tone === "today" ? "bg-orange-100 text-orange-700" :
                    formatScheduleCountdown(scheduleDate).tone === "soon" ? "bg-amber-100 text-amber-700" :
                    "bg-emerald-100 text-emerald-700"
                  }`}>
                    {formatScheduleCountdown(scheduleDate).label}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{t('purchases.schedule.notes')}</label>
                <textarea
                  value={scheduleNotes} onChange={(e) => setScheduleNotes(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-amber-400 transition"
                  placeholder={t('purchases.schedule.notes_placeholder')}
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setScheduleModalOpen(false)} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">{t('common.cancel')}</button>
              <button
                disabled={savingSchedule || !scheduleAmount || !scheduleDate}
                onClick={async () => {
                  try {
                    setSavingSchedule(true);
                    const newSched = await createPaymentSchedule({
                      purchase_id: schedulePurchase.id,
                      amount_due: Number(scheduleAmount),
                      due_date: scheduleDate,
                      notes: scheduleNotes,
                    });
                    setSchedules(prev => [...prev, newSched]);
                    setScheduleModalOpen(false);
                    showToast("success", t('purchases.schedule.success'));
                  } catch (err: any) {
                    showToast("error", err?.message || t('purchases.schedule.error'));
                  } finally { setSavingSchedule(false); }
                }}
                className="flex-1 rounded-2xl bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50 transition"
              >
                {savingSchedule ? t('purchases.schedule.saving') : t('purchases.schedule.save_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── UPCOMING PAYMENTS PANEL ── */}
      {schedules.filter(s => s.status !== "paid").length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarClock size={18} className="text-amber-600" />
              <h3 className="text-sm font-bold text-ink">{t('purchases.schedule.upcoming_title')}</h3>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                {schedules.filter(s => s.status !== "paid").length}
              </span>
            </div>
            <button onClick={() => setShowScheduleList(v => !v)} className="text-xs font-semibold text-brand-600 hover:underline">
              {showScheduleList ? t('purchases.schedule.hide') : t('purchases.schedule.show_all')}
            </button>
          </div>
          {showScheduleList && (
            <div className="overflow-hidden rounded-2xl border border-amber-100">
              {schedules.filter(s => s.status !== "paid").map(sched => {
                const countdown = formatScheduleCountdown(sched.due_date);
                const countdownClass =
                  countdown.tone === "overdue" ? "bg-rose-100 text-rose-700" :
                  countdown.tone === "today" ? "bg-orange-100 text-orange-700" :
                  countdown.tone === "soon" ? "bg-amber-100 text-amber-700" :
                  "bg-emerald-100 text-emerald-700";

                return (
                  <div key={sched.id} className={`flex items-center justify-between px-5 py-3 border-b border-amber-50 last:border-0 ${
                    sched.status === "overdue" ? "bg-rose-50" : "bg-amber-50/40"
                  }`}>
                    <div>
                      <p className="font-semibold text-ink text-sm">{sched.suppliers?.name || t('purchases.modal.supplier')}</p>
                      <p className="text-xs text-slate-500">{t('purchases.modal.date')}: {new Date(sched.due_date).toLocaleDateString()}</p>
                      <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${countdownClass}`}>
                        {countdown.label}
                      </span>
                      {sched.notes && <p className="mt-1 text-xs text-slate-400 italic">{sched.notes}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-black text-amber-700">{Number(sched.amount_due).toLocaleString()} RWF</p>
                        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                          sched.status === "overdue" ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-700"
                        }`}>{sched.status}</span>
                      </div>
                      <button
                        onClick={async () => {
                          await markSchedulePaid(sched.id);
                          setSchedules(prev => prev.map(s => s.id === sched.id ? { ...s, status: "paid" } : s));
                          showToast("success", t('purchases.schedule.mark_paid_success'));
                        }}
                        className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 transition"
                      >
                        {t('purchases.schedule.mark_paid')}
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirm(t('purchases.schedule.delete_title'), t('purchases.schedule.delete_desc'));
                          if (!ok) return;
                          await deletePaymentSchedule(sched.id);
                          setSchedules(prev => prev.filter(s => s.id !== sched.id));
                        }}
                        className="rounded-xl bg-rose-50 p-1.5 text-rose-500 hover:bg-rose-100 transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
