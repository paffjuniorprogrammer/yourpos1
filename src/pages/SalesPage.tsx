import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, CreditCard, Eye, FileText, Minus, Pencil, Plus, Printer, Search, Trash2, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { SectionCard } from "../components/ui/SectionCard";
import { Pagination } from "../components/ui/Pagination";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useSettings } from "../hooks/useSettings";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { supabaseConfigured } from "../lib/supabase";
import { addSalePayment, deleteSale, getSaleDetails, listSales, updateSaleTransaction } from "../services/saleService";
import { listPosProducts } from "../services/posService";
import { listCustomers } from "../services/customerService";
import { listUsers } from "../services/userService";
import { processReturn, type ReturnItemInput } from "../services/returnService";
import { Receipt80mm } from "../components/print/Receipt80mm";
import { InvoiceA4 } from "../components/print/InvoiceA4";
import type { PaymentMethod, PosProductRecord, SaleRecord } from "../types/database";

type SaleWithDetails = SaleRecord & {
  customer_name?: string;
  cashier_name?: string;
};

type PrintMode = "receipt" | "invoice";

export function SalesPage() {
  const { can, profile } = useAuth();
  const { showToast, confirm } = useNotification();
  const [sales, setSales] = useState<SaleWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [saleNumberFilter, setSaleNumberFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [cashierFilter, setCashierFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [customerOptions, setCustomerOptions] = useState<any[]>([]);
  const [cashierOptions, setCashierOptions] = useState<any[]>([]);
  const [selectedSale, setSelectedSale] = useState<SaleWithDetails | null>(null);
  const [saleDetails, setSaleDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode>("receipt");
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [editItems, setEditItems] = useState<any[]>([]);
  const [availableProducts, setAvailableProducts] = useState<PosProductRecord[]>([]);
  const [productQuery, setProductQuery] = useState("");

  // Return state
  const [returnItems, setReturnItems] = useState<ReturnItemInput[]>([]);
  const [returnReason, setReturnReason] = useState("");
  const [returnRefundMethod, setReturnRefundMethod] = useState("cash");
  const [returnNotes, setReturnNotes] = useState("");
  const [processingReturn, setProcessingReturn] = useState(false);

  const itemsPerPage = 10;
  const printRef = useRef<HTMLDivElement>(null);

  const { run } = useAsyncAction();
  const { settings } = useSettings();

  useRealtimeSync({
    onSaleCreated: () => void loadSales(),
    onCustomerChanged: () => void loadSales(),
    onStaffChanged: () => void loadSales(),
  });


  const loadSales = async () => {
    try {
      const { data: salesData, count } = await listSales({
        page: currentPage,
        pageSize: itemsPerPage,
        saleNumber: saleNumberFilter,
        customerId: customerFilter,
        cashierId: cashierFilter,
        date: dateFilter
      });
      
      const enrichedSales: SaleWithDetails[] = salesData.map((sale) => ({
        ...sale,
        customer_name: (sale as any).customer?.full_name || "Walk-in Customer",
        cashier_name: (sale as any).cashier?.full_name || "Unknown Cashier",
      }));
      setSales(enrichedSales);
      setTotalCount(count);
    } catch (err) {
      console.error("Failed to load sales:", err);
    }
  };

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    
    // Fetch filter options once
    const fetchFilters = async () => {
      try {
        const [c, u] = await Promise.all([listCustomers(), listUsers()]);
        setCustomerOptions(c);
        setCashierOptions(u);
      } catch (err) {
        console.error("Failed to load filter options", err);
      }
    };
    fetchFilters();

    // Set loading only on initial load or if you want it on every turn
    run(loadSales).finally(() => setLoading(false));
  }, [run, currentPage, saleNumberFilter, customerFilter, cashierFilter, dateFilter]);

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const paginatedSales = sales; // Data is already paginated from backend

  const handleViewSaleDetails = async (sale: SaleWithDetails) => {
    setSelectedSale(sale);
    setDetailsLoading(true);
    try {
      const details = await getSaleDetails(sale.id);
      setSaleDetails(details);
      setEditItems(details.sale_items || []);
      // Pre-populate return items from sale items
      setReturnItems((details.sale_items || []).map((item: any) => ({
        sale_item_id: item.id,
        product_id: item.product_id || item.products?.id,
        product_name: item.products?.name || "Unknown",
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        restock: true,
      })));
      return details;
    } catch {
      setSaleDetails(null);
      return null;
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedSale || !paymentAmount) return;
    try {
      await run(async () => {
        await addSalePayment(selectedSale.id, paymentMethod, Number(paymentAmount));
        setShowPaymentModal(false);
        setPaymentAmount("");
        await loadSales();
        if (selectedSale) {
          const updated = await getSaleDetails(selectedSale.id);
          setSaleDetails(updated);
        }
        showToast("success", "Payment recorded!");
      });
    } catch (error) {
      showToast("error", "Failed: " + (error as any).message);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedSale || !editItems.length) return;
    const subtotal   = editItems.reduce((s, i) => s + Number(i.line_total), 0);
    const taxAmount  = subtotal * ((settings?.tax_percentage ?? 0) / 100);
    const totalAmount = subtotal + taxAmount;
    try {
      await run(async () => {
        await updateSaleTransaction({
          sale_id: selectedSale.id,
          subtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          items: editItems.map((item) => ({
            product_id: item.product_id || item.products?.id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_total: item.line_total,
          })),
        });
        setShowEditModal(false);
        showToast("success", "Sale updated!");
        await loadSales();
        const updated = await getSaleDetails(selectedSale.id);
        setSaleDetails(updated);
      });
    } catch (error) {
      showToast("error", "Failed: " + (error as any).message);
    }
  };

  const handleDeleteSale = async (id: string) => {
    const ok = await confirm("Delete Sale", "Delete this sale? This cannot be undone.");
    if (!ok) return;
    try {
      await run(async () => {
        await deleteSale(id);
        setSales((c) => c.filter((s) => s.id !== id));
        if (selectedSale?.id === id) setSelectedSale(null);
        showToast("success", "Sale deleted.");
      });
    } catch { /* handled */ }
  };

  async function handleProcessReturn() {
    if (!selectedSale || !profile?.id) return;
    const selectedItems = returnItems.filter((i) => i.quantity > 0);
    if (!selectedItems.length) { showToast("error", "Select at least one item to return."); return; }
    try {
      setProcessingReturn(true);
      await processReturn({
        sale_id:       selectedSale.id,
        created_by:    profile.id,
        reason:        returnReason,
        refund_method: returnRefundMethod,
        notes:         returnNotes,
        items:         selectedItems,
      });
      showToast("success", "Return processed successfully!");
      setShowReturnModal(false);
      await loadSales();
    } catch (err: any) {
      showToast("error", err?.message || "Failed to process return.");
    } finally {
      setProcessingReturn(false);
    }
  }

  function handlePrint(mode: PrintMode) {
    setPrintMode(mode);
    setTimeout(() => window.print(), 300);
  }

  const formatCurrency = (val: number) =>
    val.toLocaleString("fr-RW", { minimumFractionDigits: 0 }) + " RWF";

  useEffect(() => {
    if (showEditModal && availableProducts.length === 0) {
      void listPosProducts(null, 500).then(setAvailableProducts);
    }
  }, [showEditModal, availableProducts.length]);

  // Build receipt data from saleDetails
  const receiptItems = (saleDetails?.sale_items || []).map((item: any) => ({
    name: item.products?.name || "Product",
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    line_total: Number(item.line_total),
    discount_amount: Number(item.discount_amount || 0),
  }));

  const paymentsList = (saleDetails?.sale_payments || []).map((p: any) => ({
    payment_method: p.payment_method,
    amount: Number(p.amount),
  }));

  return (
    <div className="relative space-y-6">
      {/* Print CSS */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #receipt-80mm, #receipt-80mm * { visibility: visible !important; }
          #invoice-a4,   #invoice-a4 *   { visibility: visible !important; }
          #receipt-80mm { position: fixed; left: 0; top: 0; }
          #invoice-a4   { position: fixed; left: 0; top: 0; }
          @page { size: ${printMode === "receipt" ? "80mm auto" : "A4"}; margin: 0; }
        }
        @media screen {
          #receipt-80mm, #invoice-a4 { display: none; }
        }
      `}</style>

      {/* Hidden print portals */}
      {selectedSale && createPortal(
        <>
          <Receipt80mm
            sale_number={selectedSale.sale_number}
            created_at={selectedSale.created_at}
            customer_name={selectedSale.customer_name}
            cashier_name={selectedSale.cashier_name}
            items={receiptItems}
            subtotal={Number(selectedSale.subtotal)}
            tax_amount={Number(selectedSale.tax_amount)}
            total_amount={Number(selectedSale.total_amount)}
            discount_amount={Number((selectedSale as any).discount_amount || 0)}
            payments={paymentsList}
            settings={settings}
          />
          {printMode === "invoice" && (
            <InvoiceA4
              sale_number={selectedSale.sale_number}
              created_at={selectedSale.created_at}
              customer_name={selectedSale.customer_name}
              customer_phone={saleDetails?.customers?.phone}
              cashier_name={selectedSale.cashier_name}
              items={receiptItems}
              subtotal={Number(selectedSale.subtotal)}
              tax_amount={Number(selectedSale.tax_amount)}
              total_amount={Number(selectedSale.total_amount)}
              discount_amount={Number((selectedSale as any).discount_amount || 0)}
              payments={paymentsList}
              payment_status={selectedSale.payment_status}
              settings={settings}
            />
          )}
        </>,
        document.body,
      )}

      <SectionCard title="Sales management" subtitle="Track transactions, manage returns and print receipts">
        <div className="mb-5 grid gap-3 lg:grid-cols-4">
          <label className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
            <Search size={16} className="text-brand-500" />
            <input value={saleNumberFilter} onChange={(e) => setSaleNumberFilter(e.target.value)} className="w-full border-none bg-transparent text-sm outline-none" placeholder="Search sale number or customer" />
          </label>
          <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none">
            <option value="all">All Customers</option>
            {customerOptions.map((c) => <option key={c.id} value={c.full_name}>{c.full_name}</option>)}
          </select>
          <select value={cashierFilter} onChange={(e) => setCashierFilter(e.target.value)} className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none">
            <option value="all">All Cashiers</option>
            {cashierOptions.map((u) => <option key={u.id} value={u.full_name}>{u.full_name}</option>)}
          </select>
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none" />
        </div>

        <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-[0_20px_50px_rgba(37,99,235,0.08)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                <tr>
                  {["Sale", "Customer", "Amount", "Status", "Cashier", "Date", "Actions"].map((col) => (
                    <th key={col} className="border-b border-white/10 px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-100">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                {loading ? (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">Loading sales...</td></tr>
                ) : paginatedSales.length > 0 ? (
                  paginatedSales.map((sale) => (
                    <tr key={sale.id} className="transition hover:bg-brand-50/40">
                      <td className="border-b border-slate-100 px-5 py-4 font-semibold text-ink">
                        <button onClick={() => handleViewSaleDetails(sale)} className="rounded-lg px-2 py-1 text-left transition hover:bg-brand-50 hover:text-brand-700">{sale.sale_number}</button>
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4 text-slate-600">{sale.customer_name}</td>
                      <td className="border-b border-slate-100 px-5 py-4 font-semibold text-brand-600">{formatCurrency(Number(sale.total_amount))}</td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${sale.payment_status === "paid" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"}`}>
                          {sale.payment_status}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4 text-slate-600">{sale.cashier_name}</td>
                      <td className="border-b border-slate-100 px-5 py-4 text-slate-600">{new Date(sale.created_at).toLocaleDateString()}</td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button onClick={() => handleViewSaleDetails(sale)} className="rounded-xl bg-slate-50 p-2 text-slate-600 transition hover:bg-slate-100" title="View"><Eye size={15} /></button>
                          {can("Sales", "edit") && (
                            <>
                              <button onClick={() => { setSelectedSale(sale); handleViewSaleDetails(sale).then(() => setShowEditModal(true)); }} className="rounded-xl bg-sky-50 p-2 text-sky-600 transition hover:bg-sky-100" title="Edit"><Pencil size={15} /></button>
                              <button disabled={sale.payment_status === "paid"} onClick={() => { 
                                setSelectedSale(sale); 
                                handleViewSaleDetails(sale).then((details) => {
                                  if (details) {
                                    const paid = (details.sale_payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
                                    const remaining = Number(sale.total_amount) - paid;
                                    setPaymentAmount(String(Math.max(0, remaining)));
                                  }
                                  setShowPaymentModal(true);
                                });
                              }} className={`rounded-xl p-2 transition ${sale.payment_status === "paid" ? "bg-slate-50 text-slate-300" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`} title="Payment"><CreditCard size={15} /></button>
                              {!(sale as any).sale_returns?.length && (
                                <button onClick={() => { handleViewSaleDetails(sale).then(() => setShowReturnModal(true)); }} className="rounded-xl bg-amber-50 p-2 text-amber-600 transition hover:bg-amber-100" title="Return/Refund"><ArrowLeftRight size={15} /></button>
                              )}
                            </>
                          )}
                          <button onClick={() => { setSelectedSale(sale); handleViewSaleDetails(sale).then(() => handlePrint("receipt")); }} className="rounded-xl bg-orange-50 p-2 text-orange-600 transition hover:bg-orange-100" title="Print Receipt"><Printer size={15} /></button>
                          <button onClick={() => { setSelectedSale(sale); handleViewSaleDetails(sale).then(() => handlePrint("invoice")); }} className="rounded-xl bg-brand-50 p-2 text-brand-600 transition hover:bg-brand-100" title="A4 Invoice"><FileText size={15} /></button>
                          {can("Sales", "delete") && (
                            <button onClick={() => handleDeleteSale(sale.id)} className="rounded-xl bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100" title="Delete"><Trash2 size={15} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">No sales match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={totalCount} itemsPerPage={itemsPerPage} onPageChange={setCurrentPage} />
        </div>
      </SectionCard>

      {/* ── SALE DETAIL MODAL ── */}
      {selectedSale && !showEditModal && !showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => { setSelectedSale(null); setSaleDetails(null); }}>
          <div className="w-full max-w-4xl rounded-[2rem] bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-600">Sale Details</p>
                <h2 className="mt-1 text-2xl font-bold text-ink">{selectedSale.sale_number}</h2>
              </div>
              <button onClick={() => { setSelectedSale(null); setSaleDetails(null); }} className="rounded-full bg-slate-100 p-2 text-slate-600"><X size={18} /></button>
            </div>

            {detailsLoading ? (
              <div className="py-8 text-center text-slate-500">Loading...</div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl bg-slate-50 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Shop</p>
                    <p className="mt-2 text-xl font-bold text-ink">{settings?.shop_name || "Retail POS"}</p>
                    <p className="mt-1 text-sm text-slate-600">{settings?.address || "—"}</p>
                    <p className="text-sm text-slate-600">{settings?.contact_phone || ""}</p>
                  </div>
                  <div className="rounded-3xl bg-brand-50 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Customer</p>
                    <p className="mt-2 text-xl font-bold text-ink">{saleDetails?.customers?.full_name ?? selectedSale.customer_name ?? "Walk-in"}</p>
                    <p className="text-sm text-slate-600">{saleDetails?.customers?.phone ?? ""}</p>
                    <p className="mt-1 text-sm text-slate-600">Cashier: {saleDetails?.users?.full_name ?? selectedSale.cashier_name}</p>
                    <p className="text-sm text-slate-600">Date: {new Date(selectedSale.created_at).toLocaleString()}</p>
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
                  <div className="grid grid-cols-[1.5fr_0.7fr_1fr_1fr] bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 px-5 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-white">
                    <span>Product</span><span>Qty</span><span>Price</span><span>Total</span>
                  </div>
                  {(saleDetails?.sale_items || []).map((item: any) => (
                    <div key={item.id} className="grid grid-cols-[1.5fr_0.7fr_1fr_1fr] border-b border-slate-100 px-5 py-3 text-sm">
                      <span className="font-semibold text-ink">{item.products?.name || "Unknown"}</span>
                      <span className="text-slate-600">{item.quantity}</span>
                      <span className="text-slate-600">{formatCurrency(Number(item.unit_price))}</span>
                      <span className="font-semibold text-brand-600">{formatCurrency(Number(item.line_total))}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4 text-center">
                    <p className="text-xs text-slate-500">Subtotal</p>
                    <p className="text-lg font-bold">{formatCurrency(Number(selectedSale.subtotal))}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4 text-center">
                    <p className="text-xs text-slate-500">Tax</p>
                    <p className="text-lg font-bold">{formatCurrency(Number(selectedSale.tax_amount))}</p>
                  </div>
                  <div className="rounded-2xl bg-brand-50 p-4 text-center">
                    <p className="text-xs text-brand-600">Total</p>
                    <p className="text-2xl font-black text-brand-700">{formatCurrency(Number(selectedSale.total_amount))}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  {can("Sales", "edit") && (
                    <>
                      <button onClick={() => setShowEditModal(true)} className="flex items-center gap-2 rounded-2xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-600">
                        <Pencil size={15} /> Edit Sale
                      </button>
                      <button onClick={() => setShowReturnModal(true)} className="flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600">
                        <ArrowLeftRight size={15} /> Return / Refund
                      </button>
                      <button disabled={selectedSale.payment_status === "paid"} onClick={() => { 
                        const paid = (saleDetails?.sale_payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
                        const remaining = Number(selectedSale.total_amount) - paid;
                        setPaymentAmount(String(Math.max(0, remaining))); 
                        setShowPaymentModal(true); 
                      }} className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white ${selectedSale.payment_status === "paid" ? "bg-slate-300" : "bg-emerald-500 hover:bg-emerald-600"}`}>
                        <CreditCard size={15} /> {selectedSale.payment_status === "paid" ? "Fully Paid" : "Record Payment"}
                      </button>
                    </>
                  )}
                  <button onClick={() => handlePrint("receipt")} className="flex items-center gap-2 rounded-2xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">
                    <Printer size={15} /> 80mm Receipt
                  </button>
                  <button onClick={() => handlePrint("invoice")} className="flex items-center gap-2 rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
                    <FileText size={15} /> A4 Invoice
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── RETURN / REFUND MODAL ── */}
      {showReturnModal && selectedSale && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-md" onClick={() => setShowReturnModal(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-[2.5rem] bg-white shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="bg-amber-500 p-8 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-white/80">
                    <ArrowLeftRight size={16} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Returns & Refunds</span>
                  </div>
                  <h2 className="mt-2 text-3xl font-black">{selectedSale.sale_number}</h2>
                </div>
                <button onClick={() => setShowReturnModal(false)} className="rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-8 space-y-6">
              <div>
                <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Select items to return</p>
                <div className="space-y-3">
                  {returnItems.map((item, idx) => (
                    <div key={idx} className="flex flex-col gap-4 rounded-3xl border border-slate-100 bg-slate-50 p-5 transition hover:border-amber-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-bold text-ink">{item.product_name}</p>
                          <p className="text-xs text-slate-400">{formatCurrency(item.unit_price)} / unit</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-amber-600">{formatCurrency(item.unit_price * item.quantity)}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between gap-4 border-t border-slate-200/50 pt-4">
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer group">
                          <div className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition ${
                            item.restock ? "border-amber-500 bg-amber-500 text-white" : "border-slate-300 bg-white group-hover:border-amber-300"
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
                            className="h-8 w-8 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500 transition active:scale-90"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-8 text-center text-lg font-black">{item.quantity}</span>
                          <button 
                            onClick={() => { 
                              const max = (saleDetails?.sale_items || []).find((s: any) => s.id === item.sale_item_id)?.quantity ?? item.quantity;
                              const ns = [...returnItems]; ns[idx].quantity = Math.min(max, ns[idx].quantity + 1); setReturnItems(ns); 
                            }}
                            className="h-8 w-8 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-emerald-500 transition active:scale-90"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] bg-slate-900 p-6 text-white shadow-xl">
                 <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Total Refund Due</p>
                      <p className="mt-1 text-3xl font-black text-amber-400">
                        {formatCurrency(returnItems.reduce((s, i) => s + i.unit_price * i.quantity, 0))}
                      </p>
                    </div>
                    <div className="h-14 w-14 rounded-2xl bg-white/10 flex items-center justify-center">
                       <CreditCard size={24} className="text-white/40" />
                    </div>
                 </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                 <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2 px-1">Refund Method</label>
                    <select value={returnRefundMethod} onChange={(e) => setReturnRefundMethod(e.target.value)} className="w-full rounded-2xl bg-slate-50 p-4 font-bold outline-none border border-slate-100 transition focus:border-amber-300">
                      <option value="cash">Cash</option>
                      <option value="momo">MoMo</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="store_credit">Store Credit</option>
                    </select>
                 </div>
                 <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2 px-1">Reason</label>
                    <select value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="w-full rounded-2xl bg-slate-50 p-4 font-bold outline-none border border-slate-100 transition focus:border-amber-300">
                      <option value="">Select Reason</option>
                      <option value="damaged">Damaged / Defective</option>
                      <option value="wrong_item">Wrong Item</option>
                      <option value="customer_changed_mind">Customer Changed Mind</option>
                      <option value="overcharged">Overcharged</option>
                      <option value="other">Other</option>
                    </select>
                 </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2 px-1">Additional Notes</label>
                <textarea 
                  value={returnNotes} 
                  onChange={(e) => setReturnNotes(e.target.value)} 
                  rows={2} 
                  className="w-full rounded-2xl bg-slate-50 p-4 text-sm font-medium outline-none border border-slate-100 transition focus:border-amber-300 resize-none" 
                  placeholder="Notes about this return..." 
                />
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 flex gap-4">
              <button 
                onClick={() => setShowReturnModal(false)}
                className="flex-1 rounded-2xl py-4 font-bold text-slate-400 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button 
                onClick={handleProcessReturn}
                disabled={processingReturn || returnItems.reduce((s,i) => s + i.quantity, 0) === 0}
                className="flex-[2] rounded-2xl bg-amber-500 py-4 font-bold text-white shadow-xl shadow-amber-200/50 hover:bg-amber-600 disabled:opacity-20 transition active:scale-95"
              >
                {processingReturn ? "Processing..." : "Process Refund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RECORD PAYMENT MODAL ── */}
      {showPaymentModal && selectedSale && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setShowPaymentModal(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Record Payment</h2>
              <button onClick={() => setShowPaymentModal(false)} className="rounded-full bg-slate-100 p-2"><X size={18} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Recording payment for <strong>{selectedSale.sale_number}</strong></p>
            <div className="flex justify-between items-center mb-6 text-sm font-medium bg-slate-50 p-4 rounded-xl">
               <span className="text-slate-700">Total: <br/><strong className="text-lg">{formatCurrency(Number(selectedSale.total_amount))}</strong></span>
               <span className="text-emerald-600 text-center">Paid: <br/><strong className="text-lg">{formatCurrency((saleDetails?.sale_payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0))}</strong></span>
               <span className="text-amber-600 text-right">Remaining: <br/><strong className="text-lg">{formatCurrency(Math.max(0, Number(selectedSale.total_amount) - (saleDetails?.sale_payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0)))}</strong></span>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Amount (RWF)</span>
                <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-brand-500" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Method</span>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none">
                  <option value="cash">Cash</option>
                  <option value="momo">MoMo</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                </select>
              </label>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowPaymentModal(false)} className="flex-1 rounded-2xl border border-slate-200 py-3 font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleRecordPayment} className="flex-1 rounded-2xl bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT SALE MODAL ── */}
      {showEditModal && selectedSale && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setShowEditModal(false)}>
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold">Edit Sale Items</h2>
                <p className="text-sm text-slate-500">{selectedSale.sale_number}</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="rounded-full bg-slate-100 p-2"><X size={18} /></button>
            </div>
            <div className="mb-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input placeholder="Search products to add..." className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 outline-none focus:border-brand-500" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
              {productQuery && (
                <div className="absolute top-full left-0 right-0 z-[70] mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-48 overflow-y-auto">
                  {availableProducts.filter(p => p.name.toLowerCase().includes(productQuery.toLowerCase())).map(product => (
                    <button key={product.id} onClick={() => {
                      const idx = editItems.findIndex(i => (i.product_id || i.products?.id) === product.id);
                      if (idx > -1) {
                        const ns = [...editItems]; ns[idx].quantity += 1; ns[idx].line_total = ns[idx].quantity * ns[idx].unit_price; setEditItems(ns);
                      } else {
                        setEditItems([...editItems, { id: Math.random().toString(), product_id: product.id, products: { name: product.name }, quantity: 1, unit_price: product.selling_price, line_total: product.selling_price }]);
                      }
                      setProductQuery("");
                    }} className="w-full text-left px-4 py-3 hover:bg-brand-50 transition border-b border-slate-50 last:border-0">
                      <p className="text-sm font-semibold">{product.name}</p>
                      <p className="text-xs text-slate-500">{product.selling_price.toLocaleString()} RWF</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {editItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex-1">
                    <p className="font-semibold text-ink text-sm">{item.products?.name}</p>
                    <p className="text-xs text-slate-500">{Number(item.unit_price).toLocaleString()} RWF</p>
                  </div>
                  <div className="flex items-center gap-2 bg-white rounded-xl p-1 border border-slate-200">
                    <button onClick={() => { const ns = [...editItems]; if (ns[idx].quantity > 1) { ns[idx].quantity -= 1; ns[idx].line_total = ns[idx].quantity * ns[idx].unit_price; setEditItems(ns); } }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-50 text-slate-600">−</button>
                    <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                    <button onClick={() => { const ns = [...editItems]; ns[idx].quantity += 1; ns[idx].line_total = ns[idx].quantity * ns[idx].unit_price; setEditItems(ns); }} className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600">+</button>
                  </div>
                  <div className="w-28 text-right font-bold text-brand-600">{Number(item.line_total).toLocaleString()} RWF</div>
                  <button onClick={() => setEditItems(editItems.filter((_, i) => i !== idx))} className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl"><Trash2 size={15} /></button>
                </div>
              ))}
              {editItems.length === 0 && <div className="py-10 text-center text-slate-400">No items. Search above to add.</div>}
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="flex justify-between items-center mb-4">
                <span className="text-slate-500">Estimated Total:</span>
                <span className="text-2xl font-bold text-ink">{(editItems.reduce((s, i) => s + Number(i.line_total), 0) * (1 + (settings?.tax_percentage ?? 0) / 100)).toLocaleString()} RWF</span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowEditModal(false)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50">Discard</button>
                <button onClick={handleSaveEdit} className="flex-1 py-3 rounded-2xl bg-brand-500 font-semibold text-white hover:bg-brand-600 shadow-lg">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
