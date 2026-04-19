import { useEffect, useMemo, useState } from "react";
import { Printer, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { SectionCard } from "../components/ui/SectionCard";
import { Pagination } from "../components/ui/Pagination";
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
  const { can } = useAuth();
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
      try {
        const customer = await createCustomer({
          full_name: formValues.name.trim(),
          phone: formValues.contact.trim(),
          email: "",
          address: formValues.address.trim(),
        });
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

    showToast("success", formValues.id ? "Customer updated successfully!" : "Customer created successfully!");
    setFormOpen(false);
    setFormValues(initialForm);
  }

  async function deleteCustomer(id: string) {
    const confirmed = await confirm("Delete Customer", "Are you sure you want to delete this customer? This will remove all their history from the registry.");
    if (!confirmed) return;

    try {
      await run(async () => {
        await deleteCustomerFromDb(id);
        setRows((current) => current.filter((row) => row.id !== id));
        if (selectedCustomer?.id === id) {
          setSelectedCustomer(null);
        }
        showToast("success", "Customer deleted.");
      });
    } catch (error) {
      console.error("Failed to delete customer:", error);
    }
  }

  function handlePrintCustomer(row: CustomerRow) {
    setSelectedCustomer(row);
    setTimeout(() => window.print(), 300);
  }

  function formatCurrency(val: number) {
    return val.toLocaleString('fr-Fr', { style: 'currency', currency: 'RWF' }).replace('RWF', '').trim() + ' RWF';
  }

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">Operations</p>
        <h2 className="mt-1 text-3xl font-bold text-ink">Customer Directory</h2>
      </div>
      <SectionCard title="Customer directory" subtitle="Manage buyers, credit balances, and payment record details">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
            <Search size={16} className="text-brand-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full border-none bg-transparent text-sm outline-none"
              placeholder="Search customer, contact or address"
            />
          </label>
          {can("Customers", "add") && (
            <button
              onClick={openCreateModal}
              className="flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              <Plus size={18} />
              Create customer
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-[0_20px_50px_rgba(37,99,235,0.08)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                <tr>
                  {[
                    "Name",
                    "Contact",
                    "Total Purchase",
                    "Unpaid",
                    "Address",
                    "Actions",
                  ].map((column) => (
                    <th
                      key={column}
                      className="border-b border-white/10 px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-100"
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
                              title="Edit Customer"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {can("Customers", "delete") && (
                            <button
                              onClick={() => deleteCustomer(row.id)}
                              className="rounded-xl bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100"
                              title="Delete Customer"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => handlePrintCustomer(row)}
                            className="rounded-xl bg-orange-50 p-2 text-orange-600 transition hover:bg-orange-100"
                            title="Print Statement"
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
                      No customers found in the database.
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
                  {formValues.id ? "Edit Customer" : "Add Customer"}
                </p>
                <h2 className="mt-1 text-2xl font-bold text-ink">
                  {formValues.id ? formValues.name : "Create customer record"}
                </h2>
              </div>
              <button onClick={() => setFormOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 overflow-y-auto px-5 py-4 md:grid-cols-2">
              <label className="rounded-2xl bg-slate-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Customer Name</span>
                <input
                  value={formValues.name}
                  onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                  placeholder="Full name"
                />
              </label>

              <label className="rounded-2xl bg-sky-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Contact</span>
                <input
                  value={formValues.contact}
                  onChange={(event) => setFormValues((current) => ({ ...current, contact: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-sky-100 bg-white px-3 py-2.5 text-sm outline-none"
                  placeholder="Phone or email"
                />
              </label>

              <label className="rounded-2xl bg-slate-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Address</span>
                <input
                  value={formValues.address}
                  onChange={(event) => setFormValues((current) => ({ ...current, address: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                  placeholder="Street, city"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4">
              <button onClick={() => setFormOpen(false)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={saveCustomer} className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700">
                Save Customer
              </button>
            </div>
          </div>
        </div>
      ) : null}

 
      {/* Hidden Print Section */}
      <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:p-8 print:z-[9999]">
         {selectedCustomer && (
            <div className="max-w-4xl mx-auto">
               <div className="flex justify-between items-start mb-10 border-b-2 border-slate-900 pb-8">
                  <div>
                     <h1 className="text-4xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Customer Statement</h1>
                     <p className="text-slate-500 font-bold">Generated on: {new Date().toLocaleDateString()}</p>
                     <p className="text-slate-950 mt-4 text-xl font-black">{selectedCustomer.name}</p>
                     <p className="text-slate-600">{selectedCustomer.contact}</p>
                     <p className="text-slate-600">{selectedCustomer.address}</p>
                  </div>
                  <div className="text-right">
                     <div className="bg-slate-900 text-white p-6 rounded-2xl">
                        <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">Total Outstanding</p>
                        <p className="text-3xl font-black">{formatCurrency(selectedCustomer.unpaidAmount)}</p>
                     </div>
                  </div>
               </div>

               <div className="mb-10">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4 px-2">Purchase History</h3>
                  <table className="w-full text-sm border-collapse">
                     <thead>
                        <tr className="bg-slate-50 border-y border-slate-200">
                           <th className="px-4 py-3 text-left font-bold text-slate-700">Date</th>
                           <th className="px-4 py-3 text-left font-bold text-slate-700">Sale ID</th>
                           <th className="px-4 py-3 text-right font-bold text-slate-700">Total Amount</th>
                           <th className="px-4 py-3 text-center font-bold text-slate-700">Status</th>
                        </tr>
                     </thead>
                     <tbody>
                        {selectedCustomer.sales.map((sale) => (
                           <tr key={sale.id} className="border-b border-slate-100">
                              <td className="px-4 py-3 text-slate-600 font-medium">{new Date(sale.created_at || Date.now()).toLocaleDateString()}</td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-500">{sale.id}</td>
                              <td className="px-4 py-3 text-right font-bold text-slate-950">{formatCurrency(sale.total_amount)}</td>
                              <td className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">{sale.payment_status}</td>
                           </tr>
                        ))}
                        {selectedCustomer.sales.length === 0 && (
                           <tr>
                              <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">No purchase history found for this customer.</td>
                           </tr>
                        )}
                     </tbody>
                  </table>
               </div>

               <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-100">
                  <div>
                     <p className="text-xs font-bold uppercase text-slate-400 mb-1">Total Purchases</p>
                     <p className="text-lg font-black text-slate-950">{formatCurrency(selectedCustomer.totalPurchase)}</p>
                  </div>
               </div>

               <div className="mt-20 text-center border-t border-slate-100 pt-8">
                  <p className="text-xs text-slate-400 italic">Thank you for your business. This is a computer-generated statement.</p>
               </div>
            </div>
         )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:block, .print\\:block * {
            visibility: visible;
          }
          .print\\:block {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}} />
    </div>
  );
}
