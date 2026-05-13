import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Trash2, Download, X, AlertCircle, Pencil, FileText, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { SectionCard } from "../components/ui/SectionCard";
import { listPosProducts } from "../services/posService";
import { 
  listPurchaseRequisitions, 
  deletePurchaseRequisition, 
  type PurchaseRequisition 
} from "../services/purchaseService";
import { listLocations } from "../services/settingsService";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "../lib/format";
import { RequisitionPrint } from "../components/print/RequisitionPrint";
import { useSettings } from "../hooks/useSettings";

export function PurchaseRequisitionPage() {
  const { t } = useTranslation();
  const { activeLocationId, can } = useAuth();
  const navigate = useNavigate();
  const { showToast, confirm } = useNotification();

  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [printingReq, setPrintingReq] = useState<PurchaseRequisition | null>(null);
  const { settings } = useSettings();

  const loadData = async () => {
    try {
      const reqs = await listPurchaseRequisitions();
      setRequisitions(reqs);
    } catch (error) {
      console.error("Failed to load data:", error);
      showToast("error", "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeLocationId]);

  useRealtimeSync({
    onProductChanged: loadData,
    onStockChanged: loadData
  });

  const handleDelete = async (id: string) => {
    if (!await confirm("Delete", "Delete this requisition?")) return;
    try {
      await deletePurchaseRequisition(id);
      showToast("success", "Requisition deleted");
      await loadData();
    } catch (error: any) {
      showToast("error", error.message);
    }
  };

  const handlePrint = (req: PurchaseRequisition) => {
    setPrintingReq(req);
    setTimeout(() => {
      window.print();
      setPrintingReq(null);
    }, 500);
  };

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
    </div>
  );

  const pendingRequisitions = requisitions.filter(r => r.status === 'pending');
  const completedRequisitions = requisitions.filter(r => r.status !== 'pending');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink">Purchase Requisitions</h1>
          <p className="text-slate-500">Plan and request inventory restocks</p>
        </div>
        {can("Requisitions", "add") && (
          <button
            onClick={() => navigate("/requisitions/new")}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg transition hover:scale-105 hover:bg-brand-600"
          >
            <Plus size={20} />
            New Requisition
          </button>
        )}
      </div>

      <div className="grid gap-6">
        <SectionCard title="Active Requisitions" subtitle="Manage your pending inventory requests">
          <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-[0_20px_50px_rgba(37,99,235,0.08)] bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm text-left">
                <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                  <tr>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest first:rounded-tl-3xl">Requisition #</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest">Location</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest">Supplier</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-right">Items</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-right last:rounded-tr-3xl">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingRequisitions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-24 text-center text-slate-400">
                        <FileText size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="font-bold">No pending requisitions found</p>
                        {can("Requisitions", "add") && (
                          <button 
                            onClick={() => navigate("/requisitions/new")}
                            className="mt-4 text-brand-600 font-bold hover:underline"
                          >
                            Create a new requisition
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    pendingRequisitions.map(req => (
                      <tr key={req.id} className="group hover:bg-slate-50 transition">
                        <td className="px-6 py-4">
                          <span className="text-sm font-black text-ink">#{req.requisition_number}</span>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">{new Date(req.created_at).toLocaleDateString()}</p>
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-600">{req.location_name}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{req.supplier_name || 'Generic'}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-black text-brand-600">
                              {formatCurrency(req.items.reduce((sum: number, i: any) => sum + (i.quantity * i.unit_cost), 0))}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              {req.items?.length || 0} PRODUCTS
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {can("Requisitions", "add") && (
                              <button
                                onClick={() => navigate(`/requisitions/edit/${req.id}`)}
                                className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:bg-brand-500 hover:text-white"
                                title="Edit"
                              >
                                <Pencil size={18} />
                              </button>
                            )}
                            <button
                              onClick={() => handlePrint(req)}
                              className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:bg-brand-500 hover:text-white"
                              title="Print"
                            >
                              <Download size={18} />
                            </button>
                            {can("Requisitions", "delete") && (
                              <button
                                onClick={() => handleDelete(req.id)}
                                className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:bg-rose-500 hover:text-white"
                                title="Delete"
                              >
                                <Trash2 size={18} />
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
          </div>
        </SectionCard>

        {completedRequisitions.length > 0 && (
          <SectionCard title="History" subtitle="Converted or cancelled requisitions">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
               {completedRequisitions.map(req => (
                 <div key={req.id} className="p-5 rounded-3xl bg-slate-50 border border-slate-100 opacity-70">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">#{req.requisition_number}</span>
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                        req.status === 'converted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {req.status}
                      </span>
                    </div>
                    <p className="font-bold text-ink truncate">{req.location_name}</p>
                    <p className="text-xs text-slate-500">{new Date(req.created_at).toLocaleDateString()}</p>
                 </div>
               ))}
            </div>
          </SectionCard>
        )}
      </div>

      {/* Printing Portal */}
      {printingReq && createPortal(
        <div id="requisition-print-portal" className="fixed inset-0 z-[9999] bg-white">
          <RequisitionPrint 
            requisition={printingReq} 
            shopName={settings?.shop_name}
            address={settings?.address}
          />
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body > *:not(#requisition-print-portal) { display: none !important; }
              #requisition-print-portal { display: block !important; position: absolute; left: 0; top: 0; }
            }
          `}} />
        </div>,
        document.body
      )}
    </div>
  );
}
