import type { ShopSettingsRecord } from "../../types/database";
import { formatCurrency } from "../../lib/format";

interface ShiftClosureReceiptProps {
  cashier_name: string;
  location_name: string;
  opened_at?: string | null;
  closed_at?: string | null;
  opening_cash?: number;
  summary: {
    cash_amount: number;
    momo_amount: number;
    bank_amount: number;
    card_amount: number;
    credit_amount: number;
    credit_collected_amount: number;
    total_amount: number;
  };
  settings?: ShopSettingsRecord | null;
}

export function ShiftClosureReceipt({
  cashier_name,
  location_name,
  opened_at,
  closed_at,
  opening_cash = 0,
  summary,
  settings,
}: ShiftClosureReceiptProps) {
  const openDate = opened_at ? new Date(opened_at) : new Date();
  const closeDate = closed_at ? new Date(closed_at) : new Date();
  const expectedCash = Number(opening_cash || 0) + Number(summary.cash_amount || 0);

  return (
    <div id="receipt-80mm" className="font-mono text-black text-xs leading-tight bg-white p-2 max-w-[80mm] mx-auto">
      {/* HEADER */}
      <div className="text-center pb-2 border-b border-black border-dashed">
        <h1 className="text-sm font-black uppercase tracking-wider">
          {settings?.shop_name || "RETAIL POS"}
        </h1>
        {settings?.address && <p className="text-[11px] mt-0.5">{settings.address}</p>}
        {settings?.contact_phone && <p className="text-[11px]">Tel: {settings.contact_phone}</p>}
        <div className="mt-1 font-bold text-[12px] border-t border-b border-black py-0.5 uppercase tracking-widest">
          *** SHIFT CLOSURE / Z-REPORT ***
        </div>
      </div>

      {/* SHIFT INFO */}
      <div className="py-2 border-b border-black border-dashed space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>Location:</span>
          <span className="font-bold">{location_name}</span>
        </div>
        <div className="flex justify-between">
          <span>Cashier:</span>
          <span className="font-bold">{cashier_name}</span>
        </div>
        <div className="flex justify-between">
          <span>Opened:</span>
          <span>{openDate.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
        <div className="flex justify-between">
          <span>Closed:</span>
          <span>{closeDate.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
      </div>

      {/* OPENING CASH */}
      <div className="py-2 border-b border-black border-dashed">
        <div className="flex justify-between font-bold text-[11px]">
          <span>STARTING CASH:</span>
          <span>{formatCurrency(Number(opening_cash || 0))}</span>
        </div>
      </div>

      {/* SALES BREAKDOWN */}
      <div className="py-2 border-b border-black border-dashed space-y-1">
        <p className="font-bold text-[11px] uppercase tracking-wider">SALES BREAKDOWN</p>
        <div className="flex justify-between text-[11px]">
          <span>Cash Sales:</span>
          <span className="font-bold">{formatCurrency(summary.cash_amount)}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span>MoMo Sales:</span>
          <span className="font-bold">{formatCurrency(summary.momo_amount)}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span>Bank Transfer:</span>
          <span className="font-bold">{formatCurrency(summary.bank_amount)}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span>Card Sales:</span>
          <span className="font-bold">{formatCurrency(summary.card_amount)}</span>
        </div>
        {summary.credit_collected_amount > 0 && (
          <div className="flex justify-between text-[11px]">
            <span>Debt Collected:</span>
            <span className="font-bold">{formatCurrency(summary.credit_collected_amount)}</span>
          </div>
        )}
        {summary.credit_amount > 0 && (
          <div className="flex justify-between text-[11px]">
            <span>Credit Sales (Unpaid):</span>
            <span className="font-bold">{formatCurrency(summary.credit_amount)}</span>
          </div>
        )}
      </div>

      {/* TOTALS */}
      <div className="py-2 border-b-2 border-black space-y-1">
        <div className="flex justify-between text-xs font-black">
          <span>TOTAL COLLECTED:</span>
          <span>{formatCurrency(summary.total_amount)}</span>
        </div>
        <div className="flex justify-between text-xs font-black pt-1 border-t border-black border-dashed">
          <span>EXPECTED CASH IN DRAWER:</span>
          <span>{formatCurrency(expectedCash)}</span>
        </div>
      </div>

      {/* SIGNATURES */}
      <div className="pt-4 pb-2 space-y-6 text-[10px]">
        <div className="flex justify-between pt-4 border-t border-black">
          <span>Cashier Signature:</span>
          <span>__________________</span>
        </div>
        <div className="flex justify-between pt-2">
          <span>Manager Signature:</span>
          <span>__________________</span>
        </div>
      </div>

      {/* FOOTER */}
      <div className="text-center pt-2 text-[10px] text-gray-500">
        Generated: {new Date().toLocaleString()}
      </div>
    </div>
  );
}
