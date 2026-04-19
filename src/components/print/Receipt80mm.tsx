import type { ShopSettingsRecord } from "../../types/database";

interface ReceiptItem {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  discount_amount?: number;
}

interface Receipt80mmProps {
  sale_number: string;
  created_at: string;
  customer_name?: string;
  cashier_name?: string;
  items: ReceiptItem[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  discount_amount?: number;
  payment_method?: string;
  payments?: { payment_method: string; amount: number }[];
  settings?: ShopSettingsRecord | null;
  isReturn?: boolean;
  return_number?: string;
}

export function Receipt80mm({
  sale_number, created_at, customer_name, cashier_name,
  items, subtotal, tax_amount, total_amount, discount_amount = 0,
  payment_method, payments, settings, isReturn, return_number,
}: Receipt80mmProps) {
  const fmt = (v: number) => v.toLocaleString("fr-RW");
  const date = new Date(created_at);

  return (
    <div
      id="receipt-80mm"
      style={{
        width: "76mm",
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: "11px",
        color: "#000",
        padding: "4mm 3mm",
        lineHeight: "1.35",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "6px" }}>
        {settings?.logo_url && (
          <img src={settings.logo_url} alt="logo" style={{ height: "36px", marginBottom: "4px" }} />
        )}
        <div style={{ fontSize: "15px", fontWeight: "900", letterSpacing: "2px", textTransform: "uppercase" }}>
          {settings?.shop_name || "RETAIL POS"}
        </div>
        {settings?.address && (
          <div style={{ fontSize: "10px", marginTop: "2px" }}>{settings.address}</div>
        )}
        {settings?.contact_phone && (
          <div style={{ fontSize: "10px" }}>Tel: {settings.contact_phone}</div>
        )}
        {settings?.contact_email && (
          <div style={{ fontSize: "10px" }}>{settings.contact_email}</div>
        )}
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

      {/* Receipt type */}
      <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "12px", marginBottom: "4px" }}>
        {isReturn ? "⟵ REFUND RECEIPT" : "CUSTOMER RECEIPT"}
      </div>

      {/* Meta */}
      <div style={{ marginBottom: "6px", fontSize: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{isReturn ? "Return #" : "Invoice #"}</span>
          <span style={{ fontWeight: "bold" }}>{isReturn ? return_number : sale_number}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Date</span>
          <span>{date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Customer</span>
          <span>{customer_name || "Walk-in"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Cashier</span>
          <span>{cashier_name || "—"}</span>
        </div>
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

      {/* Items */}
      <div style={{ marginBottom: "6px" }}>
        {items.map((item, i) => (
          <div key={i} style={{ marginBottom: "5px" }}>
            <div style={{ fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {item.name}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
              <span>{item.quantity} × {fmt(item.unit_price)}</span>
              <span style={{ fontWeight: "bold" }}>{fmt(item.line_total)}</span>
            </div>
            {item.discount_amount && item.discount_amount > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#333" }}>
                <span>  Discount</span>
                <span>-{fmt(item.discount_amount)}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

      {/* Totals */}
      <div style={{ fontSize: "10px", marginBottom: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Subtotal</span>
          <span>{fmt(subtotal)}</span>
        </div>
        {discount_amount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Discount</span>
            <span>-{fmt(discount_amount)}</span>
          </div>
        )}
        {tax_amount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Tax ({settings?.tax_percentage ?? 0}%)</span>
            <span>{fmt(tax_amount)}</span>
          </div>
        )}
      </div>

      <div style={{ borderTop: "2px solid #000", margin: "4px 0" }} />

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: "900", marginBottom: "6px" }}>
        <span>{isReturn ? "REFUNDED" : "TOTAL"}</span>
        <span>{fmt(total_amount)} RWF</span>
      </div>

      {/* Payment breakdown */}
      {payments && payments.length > 0 && (
        <div style={{ fontSize: "10px", marginBottom: "6px" }}>
          {payments.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ textTransform: "capitalize" }}>Paid ({p.payment_method})</span>
              <span>{fmt(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {!payments && payment_method && (
        <div style={{ fontSize: "10px", marginBottom: "4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Payment</span>
            <span style={{ textTransform: "capitalize" }}>{payment_method}</span>
          </div>
        </div>
      )}

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

      {/* Footer */}
      <div style={{ textAlign: "center", fontSize: "10px", marginTop: "6px" }}>
        <div style={{ marginBottom: "4px" }}>★ Thank you for shopping with us! ★</div>
        <div>Come visit us again</div>
        {date && (
          <div style={{ marginTop: "8px", fontSize: "9px", color: "#555" }}>
            Printed: {new Date().toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
