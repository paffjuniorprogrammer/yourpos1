import { useEffect, useMemo, useState } from "react";
import { Building2, Eye, Pencil, Plus, Printer, Search, Trash2, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { SectionCard } from "../components/ui/SectionCard";
import { Pagination } from "../components/ui/Pagination";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { createSupplier, deleteSupplier as deleteSupplierFromDb, listSuppliersWithMetrics, updateSupplier, type SupplierMetrics } from "../services/supplierService";
import { useRealtimeSync } from "../hooks/useRealtimeSync";

type SupplierRow = {
  id: string;
  name: string;
  location: string;
  contact: string;
  phone: string;
  totalPurchase: number;
  unpaidAmount: number;
  tinNumber: string;
  paymentTerm: string;
  bankAccount: string;
};

const initialForm: Omit<SupplierRow, "id"> = {
  name: "",
  location: "",
  contact: "",
  phone: "",
  totalPurchase: 0,
  unpaidAmount: 0,
  tinNumber: "",
  paymentTerm: "",
  bankAccount: "",
};

function makeSupplierRow(supplier: SupplierMetrics): SupplierRow {
  return {
    id: supplier.id,
    name: supplier.name,
    location: supplier.address || "Not available",
    contact: supplier.contact_name || "N/A",
    phone: supplier.phone || "N/A",
    totalPurchase: supplier.total_supplied,
    unpaidAmount: supplier.unpaid_balance,
    tinNumber: supplier.tin_number || `TIN-${supplier.id.slice(0, 4).toUpperCase()}`,
    paymentTerm: supplier.payment_term || "Net 30",
    bankAccount: supplier.bank_account || "TBD",
  };
}

export function SuppliersPage() {
  const { can } = useAuth();
  const { showToast, confirm } = useNotification();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formValues, setFormValues] = useState<SupplierRow>(initialForm as SupplierRow);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const { run } = useAsyncAction();

  const loadSuppliers = async () => {
    const suppliers = await listSuppliersWithMetrics();
    setRows(suppliers.map((supplier) => makeSupplierRow(supplier)));
  };

  useEffect(() => {
    run(loadSuppliers);
  }, [run]);

  useRealtimeSync({
    onSupplierChanged: () => void run(loadSuppliers),
    onPurchaseCreated: () => void run(loadSuppliers), // Metrics update
  });

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.name, row.contact, row.phone, row.location].some((value) => value.toLowerCase().includes(query)),
    );
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
    setFormValues(initialForm as SupplierRow);
    setFormOpen(true);
  }

  function openEditModal(row: SupplierRow) {
    setFormValues(row);
    setFormOpen(true);
  }

  async function saveSupplier() {
    if (!formValues.name.trim()) return;

    const nextRow: SupplierRow = {
      ...formValues,
      id: formValues.id ?? `SUP-${String(rows.length + 201).padStart(4, "0")}`,
      totalPurchase: formValues.totalPurchase || 0,
      unpaidAmount: formValues.unpaidAmount || 0,
      location: formValues.location.trim(),
      contact: formValues.contact.trim(),
      phone: formValues.phone.trim(),
      tinNumber: formValues.tinNumber.trim() || `TIN-${String(rows.length + 1).padStart(4, "0")}`,
      paymentTerm: formValues.paymentTerm.trim() || "Net 30",
      bankAccount: formValues.bankAccount.trim() || "TBD",
    };

    if (!formValues.id) {
      try {
        const supplier = await createSupplier({
          name: nextRow.name,
          contact_name: nextRow.contact,
          phone: nextRow.phone,
          email: "",
          address: nextRow.location,
        });
        nextRow.id = supplier.id;
      } catch (error) {
        console.error("Failed to create supplier:", error);
        return; // Stop if creation fails
      }
    } else {
      try {
        await updateSupplier(formValues.id, {
          name: nextRow.name,
          contact_name: nextRow.contact,
          phone: nextRow.phone,
          email: "",
          address: nextRow.location,
        });
        // ID remains the same
      } catch (error) {
        console.error("Failed to update supplier:", error);
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

    if (selectedSupplier?.id === nextRow.id) {
      setSelectedSupplier(nextRow);
    }
    showToast("success", formValues.id ? "Supplier updated successfully!" : "Supplier created successfully!");
    setFormOpen(false);
  }

  async function deleteSupplier(id: string) {
    const confirmed = await confirm("Delete Supplier", "Are you sure you want to delete this supplier? This action cannot be undone.");
    if (!confirmed) return;

    try {
      await run(async () => {
        await deleteSupplierFromDb(id);
        setRows((current) => current.filter((row) => row.id !== id));
        if (selectedSupplier?.id === id) {
          setSelectedSupplier(null);
        }
        showToast("success", "Supplier deleted.");
      });
    } catch (error) {
      console.error("Failed to delete supplier:", error);
    }
  }

  function handlePrint() {
    window.print();
  }

  function formatCurrency(val: number) {
    return val.toLocaleString('fr-Fr', { style: 'currency', currency: 'RWF' }).replace('RWF', '').trim() + ' RWF';
  }

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">Operations</p>
        <h2 className="mt-1 text-3xl font-bold text-ink">Supplier Registry</h2>
      </div>

      <SectionCard title="Supplier directory" subtitle="Track all supplier records, balances, and quick actions">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
            <Search size={16} className="text-brand-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full border-none bg-transparent text-sm outline-none"
              placeholder="Search supplier, contact, phone or location"
            />
          </label>
          {can("Suppliers", "add") && (
            <button
              onClick={openCreateModal}
              className="flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              <Plus size={18} />
              Create supplier
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-[0_20px_50px_rgba(37,99,235,0.08)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                <tr>
                  {[
                    "Supplier Name",
                    "Contact",
                    "Total Purchase",
                    "Unpaid Amount",
                    "Actions",
                  ].map((column) => (
                    <th key={column} className="border-b border-white/10 px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-100">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                {paginatedRows.length > 0 ? (
                  paginatedRows.map((row) => (
                    <tr key={row.id} className="transition hover:bg-brand-50/40">
                      <td className="border-b border-slate-100 px-5 py-4">
                        <button
                          onClick={() => setSelectedSupplier(row)}
                          className="rounded-lg px-2 py-1 text-left font-semibold text-brand-700 transition hover:bg-brand-50"
                        >
                          {row.name}
                        </button>
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <p className="font-medium text-ink">{row.contact}</p>
                        <p className="mt-1 text-xs text-slate-500">{row.phone}</p>
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4 font-semibold text-sky-700">{formatCurrency(row.totalPurchase)}</td>
                      <td className="border-b border-slate-100 px-5 py-4 font-semibold text-amber-700">{formatCurrency(row.unpaidAmount)}</td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {can("Suppliers", "edit") && (
                            <button
                              onClick={() => openEditModal(row)}
                              className="rounded-xl bg-sky-50 p-2 text-sky-600 transition hover:bg-sky-100"
                              title="Edit Supplier"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {can("Suppliers", "delete") && (
                            <button
                              onClick={() => deleteSupplier(row.id)}
                              className="rounded-xl bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100"
                              title="Delete Supplier"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedSupplier(row)}
                            className="rounded-xl bg-emerald-50 p-2 text-emerald-600 transition hover:bg-emerald-100"
                            title="View Details"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handlePrint()}
                            className="rounded-xl bg-orange-50 p-2 text-orange-600 transition hover:bg-orange-100"
                            title="Print Report"
                          >
                            <Printer size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                      No suppliers found in the database.
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
                  {formValues.id ? "Edit Supplier" : "Add Supplier"}
                </p>
                <h2 className="mt-1 text-2xl font-bold text-ink">
                  {formValues.id ? formValues.name : "Create supplier profile"}
                </h2>
              </div>
              <button onClick={() => setFormOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 overflow-y-auto px-5 py-4 md:grid-cols-2">
              {[
                { label: "Supplier Name", value: formValues.name, key: "name" },
                { label: "Location", value: formValues.location, key: "location" },
                { label: "Contact", value: formValues.contact, key: "contact" },
                { label: "Phone", value: formValues.phone, key: "phone" },
                { label: "TIN Number", value: formValues.tinNumber, key: "tinNumber" },
                { label: "Payment Term", value: formValues.paymentTerm, key: "paymentTerm" },
                { label: "Bank Account", value: formValues.bankAccount, key: "bankAccount" },
              ].map(({ label, value, key }) => (
                <label key={key} className="rounded-2xl bg-slate-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
                  <input
                    value={value}
                    onChange={(event) => setFormValues((current) => ({ ...current, [key]: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                    placeholder={label}
                  />
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4">
              <button onClick={() => setFormOpen(false)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={saveSupplier} className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700">
                Save Supplier
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
