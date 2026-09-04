import React from "react";
import type { ShopSettingsRecord } from "../../types/database";
import { formatCurrency } from "../../lib/format";

export type BarReceiptItem = {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  category_name?: string | null;
};

interface BarReceiptProps {
  mode: "full" | "drinks_only";
  saleNumber: string;
  destination: string;
  createdAt: string;
  cashierName?: string;
  customerName?: string;
  items: BarReceiptItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod?: string;
  amountPaid?: number;
  change?: number;
  settings?: ShopSettingsRecord | null;
  paperWidth?: "80mm" | "58mm";
}

export function BarReceipt({
  mode,
  saleNumber,
  destination,
  createdAt,
  cashierName,
  customerName,
  items,
  subtotal,
  taxAmount,
  discountAmount,
  totalAmount,
  paymentMethod = "Cash",
  amountPaid = 0,
  change = 0,
  settings,
  paperWidth = "80mm",
}: BarReceiptProps) {
  const is58mm = paperWidth === "58mm";
  const dateStr = new Date(createdAt).toLocaleString("en-GB");

  if (mode === "drinks_only") {
    return (
      <div
        id="bar-ticket-print"
        className={`bg-white text-black p-3 font-mono leading-tight ${
          is58mm ? "w-[58mm] text-[11px]" : "w-[80mm] text-[13px]"
        }`}
      >
        <div className="text-center border-b-2 border-black pb-2 mb-2">
          <p className="text-base font-black tracking-wider uppercase">*** BAR ORDER TICKET ***</p>
          <p className="text-xs font-bold uppercase mt-0.5 tracking-wide">DRINKS PREPARATION ONLY</p>
        </div>

        <div className="border-b-2 border-dashed border-black pb-2 mb-2 space-y-1">
          <div className="flex justify-between items-center text-sm font-black bg-black text-white px-2 py-1 rounded">
            <span>DESTINATION:</span>
            <span className="uppercase">{destination}</span>
          </div>
          <div className="flex justify-between text-xs pt-1">
            <span className="font-bold">Order #:</span>
            <span>{saleNumber}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="font-bold">Time:</span>
            <span>{dateStr}</span>
          </div>
          {cashierName && (
            <div className="flex justify-between text-xs">
              <span className="font-bold">Bartender/Cashier:</span>
              <span>{cashierName}</span>
            </div>
          )}
        </div>

        <div className="py-1">
          <p className="text-xs font-black uppercase tracking-wider mb-2 border-b border-black pb-1">
            BEVERAGES TO SERVE ({items.reduce((s, i) => s + i.quantity, 0)} items)
          </p>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-1">
                <span className="text-sm font-black uppercase leading-tight">{item.name}</span>
                <span className="text-base font-black bg-black text-white px-2 py-0.5 rounded ml-2">
                  {item.quantity}x
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center border-t-2 border-dashed border-black pt-2 mt-3 space-y-1">
          <p className="text-[10px] font-black uppercase tracking-wider">*** FOR BAR SERVICE ONLY ***</p>
        </div>
      </div>
    );
  }

  // Combined full customer receipt (Drinks + Food)
  return (
    <div
      id="bar-receipt-print"
      className={`bg-white text-black p-3 font-mono leading-tight ${
        is58mm ? "w-[58mm] text-[11px]" : "w-[80mm] text-[12px]"
      }`}
    >
      {/* Brand & Store Header */}
      <div className="text-center border-b-2 border-black pb-2 mb-2 space-y-1">
        <p className="text-base font-black uppercase tracking-wider">
          {settings?.shop_name || "BAR & RESTAURANT POS"}
        </p>
        {settings?.address && <p className="text-xs text-slate-700">{settings.address}</p>}
        {settings?.contact_phone && (
          <p className="text-xs text-slate-700">Tel: {settings.contact_phone}</p>
        )}
        {settings?.tin_number && (
          <p className="text-xs font-bold">TIN: {settings.tin_number}</p>
        )}
      </div>

      {/* Bill & Station Metadata */}
      <div className="border-b border-dashed border-black pb-2 mb-2 space-y-0.5 text-xs">
        <div className="flex justify-between">
          <span className="font-bold">Receipt #:</span>
          <span>{saleNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold">Date:</span>
          <span>{dateStr}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>Table/Room:</span>
          <span className="uppercase">{destination}</span>
        </div>
        {cashierName && (
          <div className="flex justify-between">
            <span>Cashier:</span>
            <span>{cashierName}</span>
          </div>
        )}
        {customerName && (
          <div className="flex justify-between">
            <span>Customer:</span>
            <span>{customerName}</span>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="border-b-2 border-black pb-2 mb-2">
        <div className="flex justify-between text-xs font-black uppercase border-b border-black pb-1 mb-1">
          <span className="flex-1">Item</span>
          <span className="w-10 text-center">Qty</span>
          <span className="w-16 text-right">Price</span>
          <span className="w-16 text-right">Total</span>
        </div>
        <div className="space-y-1 text-xs">
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between py-0.5 leading-snug">
              <span className="flex-1 font-bold">{item.name}</span>
              <span className="w-10 text-center">{item.quantity}</span>
              <span className="w-16 text-right">{item.unit_price.toLocaleString()}</span>
              <span className="w-16 text-right font-black">{item.line_total.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="space-y-1 text-xs border-b border-dashed border-black pb-2 mb-2">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between font-bold text-slate-800">
            <span>Discount:</span>
            <span>-{formatCurrency(discountAmount)}</span>
          </div>
        )}
        {taxAmount > 0 && (
          <div className="flex justify-between">
            <span>VAT / Tax:</span>
            <span>{formatCurrency(taxAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-black border-t border-black pt-1">
          <span>TOTAL DUE:</span>
          <span>{formatCurrency(totalAmount)}</span>
        </div>
      </div>

      {/* Payment Details */}
      <div className="space-y-1 text-xs border-b-2 border-black pb-2 mb-2">
        <div className="flex justify-between">
          <span className="font-bold">Payment Method:</span>
          <span className="uppercase font-black">{paymentMethod}</span>
        </div>
        {amountPaid > 0 && (
          <div className="flex justify-between">
            <span>Amount Tendered:</span>
            <span>{formatCurrency(amountPaid)}</span>
          </div>
        )}
        {change > 0 && (
          <div className="flex justify-between font-bold">
            <span>Change Returned:</span>
            <span>{formatCurrency(change)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center space-y-1 pt-1">
        <p className="text-xs font-black uppercase">THANK YOU FOR YOUR VISIT!</p>
        <p className="text-[10px] text-slate-600">Please come again</p>
      </div>
    </div>
  );
}
