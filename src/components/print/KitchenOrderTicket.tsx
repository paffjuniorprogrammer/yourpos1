import React from "react";

export type KitchenOrderItem = {
  name: string;
  quantity: number;
  category_name?: string | null;
  notes?: string | null;
};

interface KitchenOrderTicketProps {
  ticketNumber: string;
  destination: string; // e.g. "Table 4" or "Room 102 (Emerson)" or "Direct Counter"
  cashierName?: string;
  createdAt: string;
  items: KitchenOrderItem[];
  paperWidth?: "80mm" | "58mm";
}

export function KitchenOrderTicket({
  ticketNumber,
  destination,
  cashierName,
  createdAt,
  items,
  paperWidth = "80mm",
}: KitchenOrderTicketProps) {
  const is58mm = paperWidth === "58mm";
  const dateStr = new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const fullDateStr = new Date(createdAt).toLocaleDateString("en-GB");

  return (
    <div
      id="kitchen-ticket-print"
      className={`bg-white text-black p-3 font-mono leading-tight ${
        is58mm ? "w-[58mm] text-[11px]" : "w-[80mm] text-[13px]"
      }`}
    >
      {/* Header */}
      <div className="text-center border-b-2 border-black pb-2 mb-2">
        <p className="text-base font-black tracking-wider uppercase">*** KITCHEN ORDER ***</p>
        <p className="text-xs font-bold uppercase mt-0.5 tracking-wide">FOOD PREPARATION TICKET</p>
      </div>

      {/* Target & Order Info */}
      <div className="border-b-2 border-dashed border-black pb-2 mb-2 space-y-1">
        <div className="flex justify-between items-center text-sm font-black bg-black text-white px-2 py-1 rounded">
          <span>DESTINATION:</span>
          <span className="uppercase">{destination}</span>
        </div>
        <div className="flex justify-between text-xs pt-1">
          <span className="font-bold">Order #:</span>
          <span>{ticketNumber}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="font-bold">Time:</span>
          <span>{dateStr} ({fullDateStr})</span>
        </div>
        {cashierName && (
          <div className="flex justify-between text-xs">
            <span className="font-bold">Server/Cashier:</span>
            <span>{cashierName}</span>
          </div>
        )}
      </div>

      {/* Food Items List */}
      <div className="py-1">
        <p className="text-xs font-black uppercase tracking-wider mb-2 border-b border-black pb-1">
          ITEMS TO PREPARE ({items.reduce((s, i) => s + i.quantity, 0)} total)
        </p>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-start justify-between gap-2 border-b border-dotted border-slate-300 pb-1.5">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-black uppercase block leading-snug">
                  {item.name}
                </span>
                {item.notes && (
                  <span className="text-[11px] italic text-slate-700 block mt-0.5 font-sans">
                    Note: {item.notes}
                  </span>
                )}
              </div>
              <div className="shrink-0 text-right">
                <span className="inline-block text-base font-black bg-black text-white px-2 py-0.5 rounded">
                  {item.quantity}x
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center border-t-2 border-dashed border-black pt-2 mt-3 space-y-1">
        <p className="text-[10px] font-black uppercase tracking-wider">
          *** CHEF / KITCHEN ONLY ***
        </p>
        <p className="text-[9px] text-slate-600">Printed: {new Date().toLocaleTimeString()}</p>
      </div>
    </div>
  );
}
