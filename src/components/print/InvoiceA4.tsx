import type { ShopSettingsRecord } from "../../types/database";

interface InvoiceItem {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  discount_amount?: number;
}

interface InvoiceA4Props {
  sale_number: string;
  created_at: string;
  customer_name?: string;
  customer_phone?: string;
  cashier_name?: string;
  items: InvoiceItem[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  discount_amount?: number;
  payments?: { payment_method: string; amount: number }[];
  payment_status?: string;
  settings?: ShopSettingsRecord | null;
}

export function InvoiceA4({
  sale_number, created_at, customer_name, customer_phone, cashier_name,
  items, subtotal, tax_amount, total_amount, discount_amount = 0,
  payments, payment_status, settings,
}: InvoiceA4Props) {
  const fmt = (v: number) =>
    v.toLocaleString("fr-RW", { minimumFractionDigits: 0 }) + " RWF";
  const date = new Date(created_at);
  const paid = payment_status === "paid";

  return (
    <div
      id="invoice-a4"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "20mm 18mm",
        fontFamily: "'Arial', sans-serif",
        fontSize: "11pt",
        color: "#1a1a2e",
        background: "#fff",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* PAID watermark */}
      {paid && (
        <div style={{
          position: "absolute", top: "40%", left: "50%",
          transform: "translate(-50%,-50%) rotate(-30deg)",
          fontSize: "80pt", fontWeight: 900, color: "rgba(16,185,129,0.08)",
          letterSpacing: "4px", userSelect: "none", pointerEvents: "none",
          zIndex: 0,
        }}>PAID</div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          {settings?.logo_url && (
            <img src={settings.logo_url} alt="logo" style={{ height: "50px", marginBottom: "8px" }} />
          )}
          <div style={{ fontSize: "18pt", fontWeight: 900, color: "#1e3a8a" }}>
            {settings?.shop_name || "RETAIL POS"}
          </div>
          {settings?.address && <div style={{ fontSize: "9pt", color: "#64748b", marginTop: "4px" }}>{settings.address}</div>}
          {settings?.contact_phone && <div style={{ fontSize: "9pt", color: "#64748b" }}>Tel: {settings.contact_phone}</div>}
          {settings?.contact_email && <div style={{ fontSize: "9pt", color: "#64748b" }}>{settings.contact_email}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            background: "#1e3a8a", color: "#fff",
            padding: "8px 20px", borderRadius: "8px",
            fontSize: "14pt", fontWeight: 900, marginBottom: "8px",
          }}>INVOICE</div>
          <div style={{ fontSize: "10pt", color: "#475569" }}>
            <div><strong>Invoice #:</strong> {sale_number}</div>
            <div><strong>Date:</strong> {date.toLocaleDateString()}</div>
            <div><strong>Time:</strong> {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
          {paid ? (
            <div style={{
              marginTop: "8px", background: "#d1fae5", color: "#065f46",
              padding: "4px 12px", borderRadius: "20px", fontSize: "9pt", fontWeight: 700, display: "inline-block",
            }}>✓ PAID</div>
          ) : (
            <div style={{
              marginTop: "8px", background: "#fef3c7", color: "#92400e",
              padding: "4px 12px", borderRadius: "20px", fontSize: "9pt", fontWeight: 700, display: "inline-block",
            }}>UNPAID</div>
          )}
        </div>
      </div>

      {/* Bill To */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px",
        marginBottom: "24px", background: "#f8fafc", padding: "14px 18px", borderRadius: "10px",
      }}>
        <div>
          <div style={{ fontSize: "8pt", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Bill To</div>
          <div style={{ fontWeight: 700, fontSize: "12pt" }}>{customer_name || "Walk-in Customer"}</div>
          {customer_phone && <div style={{ fontSize: "10pt", color: "#64748b" }}>{customer_phone}</div>}
        </div>
        <div>
          <div style={{ fontSize: "8pt", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Served By</div>
          <div style={{ fontWeight: 700, fontSize: "12pt" }}>{cashier_name || "—"}</div>
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
        <thead>
          <tr style={{ background: "#1e3a8a", color: "#fff" }}>
            {["#", "Product", "Qty", "Unit Price", "Discount", "Total"].map((h) => (
              <th key={h} style={{
                padding: "10px 12px", textAlign: h === "#" || h === "Qty" ? "center" : h === "Total" || h === "Unit Price" || h === "Discount" ? "right" : "left",
                fontSize: "9pt", fontWeight: 700, letterSpacing: "0.5px",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
              <td style={{ padding: "9px 12px", textAlign: "center", color: "#94a3b8", fontSize: "9pt" }}>{i + 1}</td>
              <td style={{ padding: "9px 12px", fontWeight: 600, fontSize: "10pt" }}>{item.name}</td>
              <td style={{ padding: "9px 12px", textAlign: "center" }}>{item.quantity}</td>
              <td style={{ padding: "9px 12px", textAlign: "right" }}>{fmt(item.unit_price)}</td>
              <td style={{ padding: "9px 12px", textAlign: "right", color: "#dc2626" }}>
                {item.discount_amount ? `-${fmt(item.discount_amount)}` : "—"}
              </td>
              <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#1e3a8a" }}>{fmt(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "24px" }}>
        <div style={{ width: "240px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#64748b", fontSize: "10pt" }}>
            <span>Subtotal</span><span>{fmt(subtotal)}</span>
          </div>
          {discount_amount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#dc2626", fontSize: "10pt" }}>
              <span>Discount</span><span>-{fmt(discount_amount)}</span>
            </div>
          )}
          {tax_amount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#64748b", fontSize: "10pt" }}>
              <span>Tax ({settings?.tax_percentage ?? 0}%)</span><span>{fmt(tax_amount)}</span>
            </div>
          )}
          <div style={{
            display: "flex", justifyContent: "space-between",
            padding: "10px 14px", marginTop: "6px",
            background: "#1e3a8a", color: "#fff", borderRadius: "8px",
            fontSize: "13pt", fontWeight: 900,
          }}>
            <span>TOTAL</span><span>{fmt(total_amount)}</span>
          </div>
        </div>
      </div>

      {/* Payment details */}
      {payments && payments.length > 0 && (
        <div style={{ marginBottom: "20px", background: "#f0fdf4", padding: "12px 18px", borderRadius: "8px" }}>
          <div style={{ fontSize: "8pt", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Payment Details</div>
          {payments.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "10pt" }}>
              <span style={{ textTransform: "capitalize" }}>{p.payment_method}</span>
              <span style={{ fontWeight: 700 }}>{fmt(p.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        position: "absolute", bottom: "15mm", left: "18mm", right: "18mm",
        borderTop: "1px solid #e2e8f0", paddingTop: "12px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: "9pt", color: "#94a3b8",
      }}>
        <span>Thank you for your business!</span>
        <span>Printed: {new Date().toLocaleString()}</span>
      </div>
    </div>
  );
}
