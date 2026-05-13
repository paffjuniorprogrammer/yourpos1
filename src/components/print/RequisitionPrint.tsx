import React from "react";
import { formatCurrency } from "../../lib/format";
import type { PurchaseRequisition } from "../../services/purchaseService";

interface RequisitionPrintProps {
  requisition: PurchaseRequisition;
  shopName?: string;
  address?: string;
}

export function RequisitionPrint({ requisition, shopName, address }: RequisitionPrintProps) {
  const total = requisition.items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);

  return (
    <div id="requisition-print" className="bg-white p-8 font-sans text-slate-900" style={{ width: '210mm', minHeight: '297mm' }}>
      {/* Header */}
      <div className="mb-8 flex justify-between items-start border-b-4 border-slate-900 pb-6">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-900">Purchase Requisition</h1>
          <div className="mt-4 space-y-1 text-sm text-slate-500 font-bold uppercase tracking-widest">
            <p>Req #: <span className="text-slate-900">{requisition.requisition_number}</span></p>
            <p>Date: <span className="text-slate-900">{new Date(requisition.created_at).toLocaleDateString()}</span></p>
            <p>Status: <span className="text-slate-900">{requisition.status.toUpperCase()}</span></p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-black text-brand-600">{shopName || "Retail POS"}</h2>
          <p className="text-sm text-slate-500 max-w-[250px] ml-auto">{address || "Inventory Planning Division"}</p>
        </div>
      </div>

      {/* Details Grid */}
      <div className="mb-10 grid grid-cols-2 gap-8">
        <div className="rounded-2xl bg-slate-50 p-6">
          <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Requesting Location</h3>
          <p className="text-lg font-bold text-ink">{requisition.location_name || "Central Warehouse"}</p>
        </div>
        <div className="rounded-2xl bg-brand-50 p-6">
          <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-brand-400">Preferred Supplier</h3>
          <p className="text-lg font-bold text-brand-900">{requisition.supplier_name || "Open Market"}</p>
        </div>
      </div>

      {/* Items Table */}
      <div className="mb-10">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest">#</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest">Description</th>
              <th className="px-4 py-3 text-center text-xs font-black uppercase tracking-widest">Quantity</th>
              <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest">Unit Cost</th>
              <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 border-x border-slate-100">
            {requisition.items.map((item, idx) => (
              <tr key={item.id}>
                <td className="px-4 py-4 text-sm font-bold text-slate-400">{idx + 1}</td>
                <td className="px-4 py-4">
                  <p className="font-bold text-slate-900">{item.product_name}</p>
                  {item.notes && <p className="text-xs text-slate-400 italic">{item.notes}</p>}
                </td>
                <td className="px-4 py-4 text-center font-black text-slate-900">{item.quantity}</td>
                <td className="px-4 py-4 text-right text-slate-600 font-medium">{formatCurrency(item.unit_cost)}</td>
                <td className="px-4 py-4 text-right font-black text-slate-900">{formatCurrency(item.quantity * item.unit_cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50">
              <td colSpan={4} className="px-4 py-4 text-right text-sm font-black uppercase tracking-widest text-slate-500">Estimated Total Value</td>
              <td className="px-4 py-4 text-right text-xl font-black text-brand-600">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Notes & Footer */}
      <div className="mt-auto pt-10">
        <div className="grid grid-cols-2 gap-10">
          <div>
            <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Notes / Instructions</h3>
            <div className="rounded-2xl border border-slate-100 p-4 min-h-[120px] bg-slate-50/30">
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{requisition.notes || "No special instructions provided."}</p>
            </div>
          </div>
          
          <div className="space-y-10">
            <div className="flex justify-between gap-8">
              <div className="flex-1 space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Requested By (Name & Sign)</p>
                <div className="h-20 border-b border-slate-300 flex items-end pb-2">
                  <span className="text-sm font-bold text-slate-900">{requisition.created_by_name || "Manager"}</span>
                </div>
              </div>
              <div className="flex-1 space-y-4 text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Official Stamp</p>
                <div className="ml-auto h-24 w-24 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center">
                  <span className="text-[8px] font-black text-slate-200 uppercase tracking-widest">STAMP HERE</span>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-brand-400 mb-4">Authorized Approval</p>
              <div className="flex gap-8">
                <div className="flex-1 border-b border-slate-300 h-10 flex items-end pb-1">
                  <span className="text-[10px] text-slate-300 italic">Signature</span>
                </div>
                <div className="flex-1 border-b border-slate-300 h-10 flex items-end pb-1">
                  <span className="text-[10px] text-slate-300 italic">Date</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <p className="mt-12 text-[9px] text-center text-slate-400 uppercase tracking-[0.3em] font-bold">
          Valid internal requisition document • {requisition.id}
        </p>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; margin: 0; padding: 0; }
          #requisition-print { border: none; box-shadow: none; width: 100%; height: auto; }
          .no-print { display: none !important; }
        }
      `}} />
    </div>
  );
}
