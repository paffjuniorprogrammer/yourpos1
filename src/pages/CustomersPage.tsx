import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Printer, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { SectionCard } from "../components/ui/SectionCard";
import { Pagination } from "../components/ui/Pagination";
import { formatCurrency } from "../lib/format";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { createCustomer, deleteCustomer as deleteCustomerFromDb, listCustomersWithMetrics, updateCustomer, type CustomerMetrics } from "../services/customerService";
import { useRealtimeSync } from "../hooks/useRealtimeSync";

type CustomerRow = {
  id: string;
  name: string;
  contact: string;
  totalPurchase: number;
  unpaidAmount: number;
  address: string;
  sales: any[];
};

type CustomerForm = {
  id?: string;
  name: string;
  contact: string;
  address: string;
};

const initialForm: CustomerForm = {
  name: "",
  contact: "",
  address: "",
};

export function CustomersPage() {
  const { t } = useTranslation();
  const { can, business } = useAuth();

  const { showToast, confirm } = useNotification();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formValues, setFormValues] = useState<CustomerForm>(initialForm);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const { run } = useAsyncAction();

  const loadCustomers = async () => {
    const customers = await listCustomersWithMetrics();
    setRows(
      customers.map((customer) => ({
        id: customer.id,
        name: customer.full_name,
        contact: customer.phone || "N/A",
        totalPurchase: customer.total_spent,
        unpaidAmount: customer.unpaid_balance,
        address: customer.address || "Not available",
        sales: customer.sales || [],
      })),
    );
  };

  useEffect(() => {
    run(loadCustomers);
  }, [run]);

  // Real-time synchronization for Customers Page
  useRealtimeSync({
    onCustomerChanged: () => {
      void run(loadCustomers);
    },
    onSaleCreated: () => {
      // Sales affect customer metrics (total spent, unpaid balance)
      void run(loadCustomers);
    }
  });

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((row) => {
      return (
        row.name.toLowerCase().includes(query) ||
        row.contact.toLowerCase().includes(query) ||
        row.address.toLowerCase().includes(query)
      );
    });
  }, [rows, search]);

  const totalPages = Math.ceil(filteredRows.length / ITEMS_PER_PAGE);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRows.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRows, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  function openCreateModal() {
    setFormValues(initialForm);
    setFormOpen(true);
  }

  function openEditModal(row: CustomerRow) {
    setFormValues({
      id: row.id,
      name: row.name,
      contact: row.contact,
      address: row.address,
    });
    setFormOpen(true);
  }

  async function saveCustomer() {
    if (!formValues.name.trim()) {
      return;
    }

    const nextRow: CustomerRow = {
      id: formValues.id ?? `CUS-${String(rows.length + 201).padStart(4, "0")}`,
      name: formValues.name.trim(),
      contact: formValues.contact.trim(),
      totalPurchase: 0,
      unpaidAmount: 0,
      address: formValues.address.trim() || "",
      sales: formValues.id
        ? rows.find((row) => row.id === formValues.id)?.sales ?? []
        : [],
    };

    if (!formValues.id) {
      if (!business?.id) {
        showToast("error", "Business context not found.");
        return;
      }
      try {
        const customer = await createCustomer({
          full_name: formValues.name.trim(),
          phone: formValues.contact.trim(),
          email: "",
          address: formValues.address.trim(),
        }, business.id);
        nextRow.id = customer.id;
      } catch (error) {
        console.error("Failed to create customer:", error);
        return; // Stop if creation fails
      }
    } else {
      try {
        const updated = await updateCustomer(formValues.id, {
          full_name: formValues.name.trim(),
          phone: formValues.contact.trim(),
          email: "",
          address: formValues.address.trim(),
        });
        // ID remains the same
      } catch (error) {
        console.error("Failed to update customer:", error);
        return; // Stop if update fails
      }
    }

    setRows((current) => {
      const exists = current.some((row) => row.id === nextRow.id);
      if (exists) {
        return current.map((row) => (row.id === nextRow.id ? nextRow : row));
      }
      return [nextRow, ...current];
    });

    setSelectedCustomer(nextRow);

    showToast("success", formValues.id ? t('customers.success.updated') : t('customers.success.created'));
    setFormOpen(false);
    setFormValues(initialForm);
  }

  async function deleteCustomer(id: string) {
    const confirmed = await confirm(t('customers.modal.delete_title'), t('customers.modal.delete_desc'));
    if (!confirmed) return;

    try {
      await run(async () => {
        await deleteCustomerFromDb(id);
        setRows((current) => current.filter((row) => row.id !== id));
        if (selectedCustomer?.id === id) {
          setSelectedCustomer(null);
        }
        showToast("success", t('customers.success.deleted'));
      });
    } catch (error) {
      console.error("Failed to delete customer:", error);
    }
  }

  function handlePrintCustomer(row: CustomerRow) {
    setSelectedCustomer(row);
    setTimeout(() => window.print(), 300);
  }

  const currency = formatCurrency;

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">{t('dashboard.stats.customers')}</p>
        <h2 className="mt-1 text-3xl font-bold text-ink">{t('customers.title')}</h2>
      </div>

      <SectionCard title={t('customers.title')} subtitle={t('customers.subtitle')}>
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
            <Search size={16} className="text-brand-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full border-none bg-transparent text-sm outline-none"
              placeholder={t('customers.search_placeholder')}
            />
          </label>

          {can("Customers", "add") && (
            <button
              onClick={openCreateModal}
              className="flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              <Plus size={18} />
              {t('customers.new_customer')}
            </button>

          )}
        </div>

        <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-[0_20px_50px_rgba(37,99,235,0.08)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                <tr>
                  {[
                    t('customers.table.name'),
                    t('customers.table.contact'),
                    t('customers.table.total_purchase'),
                    t('customers.table.unpaid'),
                    t('customers.table.address'),
                    t('common.actions'),
                  ].map((column) => (
                    <th
                      key={column}
                      className="border-b border-white/10 px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-100"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="bg-white">
                {paginatedRows.length > 0 ? (
                  paginatedRows.map((row) => (
                    <tr key={row.id} className="transition hover:bg-brand-50/40">
                      <td className="border-b border-slate-100 px-5 py-4 font-semibold text-ink">
                        <button
                          onClick={() => setSelectedCustomer(row)}
                          className="rounded-lg px-2 py-1 text-left transition hover:bg-brand-50 hover:text-brand-700"
                        >
                          {row.name}
                        </button>
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4 text-slate-600">
                        {row.contact}
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4 font-semibold text-brand-600">
                        {formatCurrency(row.totalPurchase)}
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4 font-semibold text-amber-700">
                        {formatCurrency(row.unpaidAmount)}
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4 text-slate-600">
                        {row.address}
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <div className="flex items-center gap-2">
                          {can("Customers", "edit") && (
                            <button
                              onClick={() => openEditModal(row)}
                              className="rounded-xl bg-sky-50 p-2 text-sky-600 transition hover:bg-sky-100"
                              title={t('common.edit')}
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {can("Customers", "delete") && (
                            <button
                              onClick={() => deleteCustomer(row.id)}
                              className="rounded-xl bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100"
                              title={t('common.delete')}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => handlePrintCustomer(row)}
                            className="rounded-xl bg-orange-50 p-2 text-orange-600 transition hover:bg-orange-100"
                            title={t('common.print')}
                          >
                            <Printer size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                      {t('customers.no_customers')}
                    </td>
                  </tr>
                )}

              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredRows.length}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setCurrentPage}
          />
        </div>
      </SectionCard>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm" onClick={() => setFormOpen(false)}>
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">
                  {formValues.id ? t('customers.modal.edit_title') : t('customers.modal.create_title')}
                </p>
                <h2 className="mt-1 text-2xl font-bold text-ink">
                  {formValues.id ? formValues.name : t('customers.modal.subtitle')}
                </h2>
              </div>

              <button onClick={() => setFormOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 overflow-y-auto px-5 py-4 md:grid-cols-2">
              <label className="rounded-2xl bg-slate-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('customers.modal.name')}</span>
                <input
                  value={formValues.name}
                  onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                  placeholder={t('customers.modal.name_placeholder')}
                />
              </label>


              <label className="rounded-2xl bg-sky-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">{t('customers.modal.contact')}</span>
                <input
                  value={formValues.contact}
                  onChange={(event) => setFormValues((current) => ({ ...current, contact: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-sky-100 bg-white px-3 py-2.5 text-sm outline-none"
                  placeholder={t('customers.modal.contact_placeholder')}
                />
              </label>


              <label className="rounded-2xl bg-slate-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('customers.modal.address')}</span>
                <input
                  value={formValues.address}
                  onChange={(event) => setFormValues((current) => ({ ...current, address: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                  placeholder={t('customers.modal.address_placeholder')}
                />
              </label>

            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4">
              <button onClick={() => setFormOpen(false)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                {t('common.cancel')}
              </button>
              <button onClick={saveCustomer} className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700">
                {t('customers.modal.save_btn')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

 
      {/* ── CUSTOMER PRINT PORTAL ── */}
      {selectedCustomer && createPortal(
        <div className="print-doc" style={{ padding: '18mm', fontFamily: 'system-ui, sans-serif', color: '#0f172a' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '24px' }}>
            <div>
              <p style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#94a3b8', marginBottom: '4px' }}>{t('customers.print.title')}</p>
              <p style={{ fontSize: '9px', color: '#94a3b8' }}>{t('customers.print.generated_on')} {new Date().toLocaleDateString()}</p>
              <h1 style={{ fontSize: '22px', fontWeight: 900, margin: '8px 0 2px' }}>{selectedCustomer.name}</h1>
              <p style={{ fontSize: '11px', color: '#64748b' }}>{selectedCustomer.contact}</p>
              <p style={{ fontSize: '11px', color: '#64748b' }}>{selectedCustomer.address}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#94a3b8', marginBottom: '4px' }}>{t('customers.print.outstanding')}</p>
              <p style={{ fontSize: '28px', fontWeight: 900, color: selectedCustomer.unpaidAmount > 0 ? '#dc2626' : '#059669' }}>{formatCurrency(selectedCustomer.unpaidAmount)}</p>
            </div>
          </div>

          {/* Purchase History */}
          <p style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#94a3b8', marginBottom: '10px' }}>{t('customers.print.history')}</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '20px' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('common.date')}</th>
                <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Order #</th>
                <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('common.amount')}</th>
                <th style={{ padding: '9px 12px', textAlign: 'center', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {selectedCustomer.sales.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>{t('customers.print.no_history')}</td></tr>
              ) : selectedCustomer.sales.map((sale, idx) => (
                <tr key={sale.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '9px 12px', color: '#64748b' }}>{new Date(sale.created_at || Date.now()).toLocaleDateString()}</td>
                  <td style={{ padding: '9px 12px', fontWeight: 700 }}>#{String(idx + 1).padStart(4, '0')}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800 }}>{formatCurrency(sale.total_amount)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: sale.payment_status === 'paid' ? '#059669' : '#d97706' }}>{sale.payment_status}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #e2e8f0', paddingTop: '12px' }}>
            <div>
              <p style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#94a3b8', marginBottom: '2px' }}>{t('customers.print.total_purchases')}</p>
              <p style={{ fontSize: '18px', fontWeight: 900 }}>{formatCurrency(selectedCustomer.totalPurchase)}</p>
            </div>
          </div>

          <p style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'center', marginTop: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '12px', fontStyle: 'italic' }}>{t('customers.print.footer')}</p>
        </div>,
        document.body
      )}
    </div>
  );
}
