import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CreditCard, Pencil, Plus, Printer, Search, Trash2, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { SectionCard } from "../components/ui/SectionCard";
import { Pagination } from "../components/ui/Pagination";
import { QuickAddProductModal } from "../components/ui/QuickAddProductModal";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { createPurchase, deletePurchase, listPurchases, updatePurchase, updatePurchaseStatus, type PurchaseSummary } from "../services/purchaseService";
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
  deliveryStatus: DeliveryStatus;
  date: string;
  items: PurchaseLine[];
};

// Removed hardcoded companyInfo - now using useSettings() hook

const createEmptyForm = (): PurchaseFormState => ({
  supplier: "",
  location: "",
  paymentStatus: "Due",
  deliveryStatus: "Pending",
  date: new Date().toISOString().split("T")[0],
  items: [],
});

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-RW', {
    style: 'currency',
    currency: 'RWF',
    minimumFractionDigits: 0,
  }).format(amount);
};

function formatMoney(value: number) {
  return formatCurrency(value);
}

function lineTotal(item: PurchaseLine) {
  return item.quantity * item.purchasePrice;
}

export function PurchasesPage() {
  const { can } = useAuth();
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
      });
      // Update local options - proper state, no window hacks
      setSupplierOptions(prev => [...prev, created.name]);
      setSupplierObjects(prev => [...prev, { id: created.id, name: created.name }]);
      setPurchaseForm(f => ({ ...f, supplier: created.name }));
      setSupplierSearch(created.name);
      setQuickSupplierOpen(false);
      setNewSupplierName("");
      setNewSupplierPhone("");
      setNewSupplierContact("");
      showToast("success", `Supplier "${created.name}" added!`);
    } catch (err: any) {
      showToast("error", err?.message || "Failed to create supplier.");
    } finally {
      setSavingSupplier(false);
    }
  }

  const loadPage = async () => {
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
          payment_status: status.toLowerCase() as any,
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
        showToast("success", `Order marked as ${status}.`);
      });
    } catch (error) {
      console.error("Failed to update delivery status:", error);
      showToast("error", "Failed to update delivery status.");
    }
  }

  async function handleDeletePurchase(id: string) {
    const confirmed = await confirm("Delete Purchase", "Are you sure you want to delete this purchase order? This action cannot be undone and will reverse stock levels.");
    if (!confirmed) return;

    try {
      await run(async () => {
        await deletePurchase(id);
        setRows((current) => current.filter((row) => row.id !== id));
        if (selectedPurchase?.id === id) {
          setSelectedPurchase(null);
        }
        showToast("success", "Purchase order deleted.");
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

  async function savePurchase() {
    if (!purchaseForm.items.length) return;

    const supplierId = supplierObjects.find(s => s.name === purchaseForm.supplier)?.id;
    if (!supplierId) {
      showToast("warning", "Please select a valid supplier.");
      return;
    }

    const locationId = locationOptions.find(l => l.name === purchaseForm.location)?.id;
    if (!locationId) {
      showToast("warning", "Please select a valid location.");
      return;
    }

    await run(async () => {
      try {
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
        showToast("success", purchaseForm.id ? "Purchase order updated!" : "Purchase order created!");
        setPurchaseModalOpen(false);
        setPurchaseForm(createEmptyForm());
      } catch (error: any) {
        const msg = error?.message || JSON.stringify(error);
        const hint = error?.hint ? `\nHint: ${error.hint}` : "";
        const detail = error?.details ? `\nDetail: ${error.details}` : "";
        showToast("error", `Failed to save purchase: ${msg}${hint}${detail}`);
        console.error("Failed to save purchase:", error);
      }
    });
  }

  const noResults = rows.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">Purchases</p>
          <h1 className="mt-3 text-3xl font-bold text-ink">Purchase orders</h1>
          <p className="mt-2 text-sm text-slate-500">Manage purchase orders, supplier invoices, and delivery updates from the database.</p>
        </div>
        {can("Purchases", "add") && (
          <button onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700">
            <Plus size={18} /> Create purchase
          </button>
        )}
      </div>

      <SectionCard title="Purchase orders" subtitle="Review the latest supplier invoices and manage status updates.">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
            <Search size={16} className="text-brand-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full border-none bg-transparent text-sm outline-none"
              placeholder="Search supplier, order ID or date"
            />
          </label>
        </div>

        <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-[0_20px_50px_rgba(37,99,235,0.08)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                <tr>
                  {[
                    "Order",
                    "Supplier",
                    "Location",
                    "Amount",
                    "Status",
                    "Delivery",
                    "Date",
                    "Actions",
                  ].map((column) => (
                    <th key={column} className="border-b border-white/10 px-6 py-5 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-100">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                {noResults ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-slate-500">
                      No purchase records found in the database.
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
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-700 font-medium text-sm">{row.supplier}</td>
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-500 text-sm">{row.location}</td>
                      <td className="border-b border-slate-100 px-4 py-3 font-bold text-brand-600 text-sm">{row.amount}</td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <button
                          onClick={(e) => setStatusPopup({ id: row.id, type: "payment", anchor: e.currentTarget.getBoundingClientRect() })}
                          className={`rounded-full px-3 py-1 text-[11px] font-bold ring-1 transition hover:brightness-95 cursor-pointer ${
                            row.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' :
                            row.paymentStatus === 'Partially Paid' ? 'bg-sky-50 text-sky-600 ring-sky-100' :
                            'bg-amber-50 text-amber-600 ring-amber-100'
                          }`}
                        >
                          {row.paymentStatus} ▾
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
                          {row.deliveryStatus} ▾
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
                            <button
                              onClick={() => {
                                setSchedulePurchase(row);
                                setScheduleAmount(row.amount.replace(/[^0-9.]/g, ""));
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
              {statusPopup.type === "payment" ? "Payment Status" : "Delivery Status"}
            </p>
            {statusPopup.type === "payment" ? (
              <div className="grid gap-1">
                {(["paid", "unpaid", "partial"] as const).map((val) => {
                  const label = val === "paid" ? "Paid" : val === "partial" ? "Partially Paid" : "Due (Unpaid)";
                  const colors = val === "paid" ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : val === "partial" ? "bg-sky-50 text-sky-700 hover:bg-sky-100" : "bg-amber-50 text-amber-700 hover:bg-amber-100";
                  return (
                    <button
                      key={val}
                      onClick={async () => {
                        await updatePurchaseStatus(statusPopup.id, "payment_status", val);
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
            ) : (
              <div className="grid gap-1">
                {(["pending", "received"] as const).map((val) => {
                  const label = val === "received" ? "Received" : "Pending";
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
                  {purchaseForm.id ? "Edit Purchase Order" : "New Purchase Order"}
                </h2>
                <p className="text-sm text-slate-500 mt-1">Create a new stock entry and update inventory levels.</p>
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
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Supplier</label>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={(e) => { setSupplierSearch(e.target.value); setSupplierMenuOpen(true); }}
                    onFocus={() => setSupplierMenuOpen(true)}
                    placeholder="Search supplier..."
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
                          No supplier found for &ldquo;{supplierSearch}&rdquo;
                        </p>
                        <button
                          onMouseDown={(e) => { e.preventDefault(); setNewSupplierName(supplierSearch); setQuickSupplierOpen(true); setSupplierMenuOpen(false); }}
                          className="flex w-full items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 transition"
                        >
                          <Plus size={14} /> Add &ldquo;{supplierSearch}&rdquo; as supplier
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Location</label>
                <select
                  value={purchaseForm.location}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, location: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-brand-500 transition"
                >
                  <option value="" disabled>Select</option>
                  {locationOptions.map((location) => (
                    <option key={location.id} value={location.name}>{location.name}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Date</label>
                <input
                  type="date"
                  value={purchaseForm.date}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, date: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-brand-500 transition"
                />
              </div>

              {/* Payment */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Payment</label>
                <select
                  value={purchaseForm.paymentStatus}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, paymentStatus: e.target.value as PaymentStatus })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-brand-500 transition"
                >
                  <option value="Paid">Paid</option>
                  <option value="Due">Due</option>
                  <option value="Partially Paid">Partial</option>
                </select>
              </div>

              {/* Delivery */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Delivery</label>
                <select
                  value={purchaseForm.deliveryStatus}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, deliveryStatus: e.target.value as DeliveryStatus })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none focus:border-brand-500 transition"
                >
                  <option value="Pending">Pending</option>
                  <option value="Received">Received</option>
                </select>
              </div>
            </div>

            {/* Product search bar */}
            <div className="mb-3">
               <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Add Product</label>
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
                        placeholder="Search name or barcode..."
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
                                <p className="text-xs text-slate-400">{p.barcode || "No barcode"}</p>
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
                            <p className="text-slate-400 text-sm">No products found for "{productSearch}"</p>
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
                        {["Product Infomation", "Quantity", "Cost Price", "Profit %", "Selling Price", ""].map((col) => (
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
                              Search or scan products to add them to this purchase.
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
                <p className="text-sm font-medium text-slate-500">Order Summary</p>
                <h3 className="text-3xl font-black text-ink">{formatMoney(purchaseTotal)}</h3>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  onClick={() => setPurchaseModalOpen(false)}
                  className="flex-1 sm:flex-none py-4 px-8 rounded-2xl border border-slate-200 font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={savePurchase}
                  disabled={!purchaseForm.items.length || !purchaseForm.supplier}
                  className="flex-1 sm:flex-none py-4 px-8 rounded-2xl bg-brand-600 font-bold text-white transition hover:bg-brand-700 shadow-xl shadow-brand-100 disabled:opacity-50"
                >
                  Save Purchase
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View/Print Invoice Modal */}
      {selectedPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 overflow-y-auto py-8 backdrop-blur-sm" onClick={() => setSelectedPurchase(null)}>
          <div className="w-full max-w-4xl rounded-[2rem] bg-white p-8 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedPurchase(null)}
              className="absolute right-6 top-6 rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
            >
              <X size={20} />
            </button>
            <div id="purchase-invoice">
              <div className="mb-8 flex flex-col sm:flex-row justify-between gap-6 items-start">
                <div>
                  <h2 className="text-3xl font-black text-brand-600">INVOICE</h2>
                  <p className="text-slate-500 mt-1">ID: {selectedPurchase.id}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-ink uppercase">{settings?.shop_name || "RETAIL POS"}</p>
                  <p className="text-sm text-slate-500">{settings?.address || ""}</p>
                  <p className="text-sm text-slate-500">{settings?.contact_phone || ""}</p>
                </div>
              </div>

              <div className="grid gap-8 md:grid-cols-2 mb-10 pb-8 border-b border-slate-100">
                <div className="rounded-3xl bg-slate-50 p-6">
                  <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 mb-4">Supplier Information</h4>
                  <p className="text-xl font-bold text-ink">{selectedPurchase.supplier}</p>
                  <p className="text-sm text-slate-500 mt-2">Delivery Status: {selectedPurchase.deliveryStatus}</p>
                </div>
                <div className="rounded-3xl bg-brand-50 p-6">
                  <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 mb-4">Order Details</h4>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-slate-600 font-medium">Purchase Date:</span>
                    <span className="text-sm font-bold text-ink">{selectedPurchase.date}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 font-medium">Payment Status:</span>
                    <span className="text-sm font-bold text-ink">{selectedPurchase.paymentStatus}</span>
                  </div>
                </div>
              </div>

              <div className="mb-10 overflow-hidden rounded-[2rem] border border-slate-100">
                <table className="w-full text-left text-sm border-separate border-spacing-0">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider">Product</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider text-right">Price</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider text-center">Qty</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPurchase.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100 last:border-0">
                        <td className="px-6 py-4 font-bold text-ink">{item.product}</td>
                        <td className="px-6 py-4 text-right">{formatMoney(item.purchasePrice)}</td>
                        <td className="px-6 py-4 text-center font-medium">{item.quantity}</td>
                        <td className="px-6 py-4 text-right font-bold text-brand-600">{formatMoney(item.purchasePrice * item.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-6 border-t border-slate-100">
                <div className="w-full max-w-xs space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Subtotal</span>
                    <span className="font-bold text-ink">{selectedPurchase.amount}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t-2 border-slate-200">
                    <span className="text-lg font-black text-ink uppercase">Grand Total</span>
                    <span className="text-2xl font-black text-brand-600">{selectedPurchase.amount}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-10 flex justify-end gap-3">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-6 py-3 font-bold text-white transition hover:bg-brand-700 shadow-xl shadow-brand-100"
              >
                <Printer size={18} /> Print Invoice
              </button>
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
                <p className="text-xs font-bold uppercase tracking-widest text-brand-600 mb-1">Quick Action</p>
                <h2 className="text-2xl font-bold text-ink">Add New Supplier</h2>
              </div>
              <button onClick={() => setQuickSupplierOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Supplier Name *</label>
                <input type="text" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-brand-500 transition" placeholder="e.g. Rwanda Coffee Ltd" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Contact Name</label>
                <input type="text" value={newSupplierContact} onChange={(e) => setNewSupplierContact(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-brand-500 transition" placeholder="Contact person name" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Phone</label>
                <input type="text" value={newSupplierPhone} onChange={(e) => setNewSupplierPhone(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-brand-500 transition" placeholder="+250 7xx xxx xxx" />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setQuickSupplierOpen(false)} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
              <button onClick={handleQuickAddSupplier} disabled={savingSupplier || !newSupplierName.trim()} className="flex-1 rounded-2xl bg-brand-600 py-3 text-sm font-bold text-white shadow-soft hover:bg-brand-700 transition disabled:opacity-50">
                {savingSupplier ? "Saving..." : "Create & Select"}
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
                <p className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-1">Payment Schedule</p>
                <h2 className="text-xl font-bold text-ink">Schedule Supplier Payment</h2>
                <p className="text-sm text-slate-500 mt-1">{schedulePurchase.supplier}</p>
              </div>
              <button onClick={() => setScheduleModalOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Amount Due (RWF) *</label>
                <input
                  type="number" min="0" value={scheduleAmount}
                  onChange={(e) => setScheduleAmount(e.target.value)}
                  className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-amber-400 transition"
                  placeholder="Amount to pay"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Due Date *</label>
                <input
                  type="date" value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-amber-400 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Notes</label>
                <textarea
                  value={scheduleNotes} onChange={(e) => setScheduleNotes(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-amber-400 transition"
                  placeholder="Payment terms, batch number..."
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setScheduleModalOpen(false)} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
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
                    showToast("success", "Payment scheduled!");
                  } catch (err: any) {
                    showToast("error", err?.message || "Failed to schedule payment");
                  } finally { setSavingSchedule(false); }
                }}
                className="flex-1 rounded-2xl bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50 transition"
              >
                {savingSchedule ? "Saving..." : "Schedule Payment"}
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
              <h3 className="text-sm font-bold text-ink">Upcoming Supplier Payments</h3>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                {schedules.filter(s => s.status !== "paid").length}
              </span>
            </div>
            <button onClick={() => setShowScheduleList(v => !v)} className="text-xs font-semibold text-brand-600 hover:underline">
              {showScheduleList ? "Hide" : "Show all"}
            </button>
          </div>
          {showScheduleList && (
            <div className="overflow-hidden rounded-2xl border border-amber-100">
              {schedules.filter(s => s.status !== "paid").map(sched => (
                <div key={sched.id} className={`flex items-center justify-between px-5 py-3 border-b border-amber-50 last:border-0 ${
                  sched.status === "overdue" ? "bg-rose-50" : "bg-amber-50/40"
                }`}>
                  <div>
                    <p className="font-semibold text-ink text-sm">{sched.suppliers?.name || "Supplier"}</p>
                    <p className="text-xs text-slate-500">Due: {new Date(sched.due_date).toLocaleDateString()}</p>
                    {sched.notes && <p className="text-xs text-slate-400 italic">{sched.notes}</p>}
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
                        showToast("success", "Marked as paid!");
                      }}
                      className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 transition"
                    >
                      Mark Paid
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await confirm("Delete Schedule", "Remove this payment schedule?");
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
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

