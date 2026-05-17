import type { ShopSettingsRecord } from "../../types/database";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const fmt = (v: number) =>
    v.toLocaleString("fr-RW", { minimumFractionDigits: 0 }) + " RWF";
  const date = new Date(created_at);
  const paid = payment_status === "paid";
  const signatureFields = [
    { label: "Prepared by", name: cashier_name || "" },
    { label: "Received by", name: customer_name || "" },
    { label: "Checked / Confirmed by", name: "" },
  ];

  return (
    <div
      id="invoice-a4"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "20mm 18mm",
        fontFamily: "'Arial', sans-serif",
        fontSize: "11pt",
        color: "#020617",
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
        }}>{t('sales.status.paid').toUpperCase()}</div>
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
          {settings?.address && <div style={{ fontSize: "9pt", color: "#0f172a", marginTop: "4px" }}>{settings.address}</div>}
          {settings?.contact_phone && <div style={{ fontSize: "9pt", color: "#0f172a" }}>Tel: {settings.contact_phone}</div>}
          {settings?.contact_email && <div style={{ fontSize: "9pt", color: "#0f172a" }}>{settings.contact_email}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            background: "#1e3a8a", color: "#fff",
            padding: "8px 20px", borderRadius: "8px",
            fontSize: "14pt", fontWeight: 900, marginBottom: "8px",
          }}>{t('sales.receipt.invoice_title')}</div>
          <div style={{ fontSize: "10pt", color: "#0f172a" }}>
            <div><strong>{t('sales.receipt.invoice_num')}</strong> {sale_number}</div>
            <div><strong>{t('common.date')}:</strong> {date.toLocaleDateString()}</div>
            <div><strong>{t('common.time')}:</strong> {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
          {paid ? (
            <div style={{
              marginTop: "8px", background: "#d1fae5", color: "#065f46",
              padding: "4px 12px", borderRadius: "20px", fontSize: "9pt", fontWeight: 900, display: "inline-block",
            }}>✓ {t('sales.status.paid').toUpperCase()}</div>
          ) : (
            <div style={{
              marginTop: "8px", background: "#fef3c7", color: "#92400e",
              padding: "4px 12px", borderRadius: "20px", fontSize: "9pt", fontWeight: 900, display: "inline-block",
            }}>{t('sales.status.unpaid').toUpperCase()}</div>
          )}
        </div>
      </div>

      {/* Bill To */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px",
        marginBottom: "24px", background: "#f8fafc", padding: "14px 18px", borderRadius: "10px",
        border: "1px solid #e2e8f0",
      }}>
        <div>
          <div style={{ fontSize: "8pt", fontWeight: 900, color: "#334155", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>{t('sales.receipt.bill_to')}</div>
          <div style={{ fontWeight: 700, fontSize: "12pt" }}>{customer_name || t('sales.walk_in_customer')}</div>
          {customer_phone && <div style={{ fontSize: "10pt", color: "#0f172a" }}>{customer_phone}</div>}
        </div>
        <div>
          <div style={{ fontSize: "8pt", fontWeight: 900, color: "#334155", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>{t('sales.receipt.served_by')}</div>
          <div style={{ fontWeight: 700, fontSize: "12pt" }}>{cashier_name || "—"}</div>
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
        <thead>
          <tr style={{ background: "#1e3a8a", color: "#fff" }}>
            {["#", t('sales.details.product'), t('sales.details.qty'), t('products.table.price'), t('sales.details.discount'), t('common.total')].map((h) => (
              <th key={h} style={{
                padding: "10px 12px", textAlign: h === "#" || h === "Qty" ? "center" : h === "Total" || h === "Unit Price" || h === "Discount" ? "right" : "left",
                fontSize: "9pt", fontWeight: 900, letterSpacing: "0.5px",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
              <td style={{ padding: "9px 12px", textAlign: "center", color: "#0f172a", fontSize: "9pt", borderBottom: "1px solid #e2e8f0" }}>{i + 1}</td>
              <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: "10pt", borderBottom: "1px solid #e2e8f0" }}>{item.name}</td>
              <td style={{ padding: "9px 12px", textAlign: "center", borderBottom: "1px solid #e2e8f0" }}>{item.quantity}</td>
              <td style={{ padding: "9px 12px", textAlign: "right", borderBottom: "1px solid #e2e8f0" }}>{fmt(item.unit_price)}</td>
              <td style={{ padding: "9px 12px", textAlign: "right", color: "#dc2626", borderBottom: "1px solid #e2e8f0" }}>
                {item.discount_amount ? `-${fmt(item.discount_amount)}` : "—"}
              </td>
              <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 900, color: "#1e3a8a", borderBottom: "1px solid #e2e8f0" }}>{fmt(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "24px" }}>
        <div style={{ width: "240px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#0f172a", fontSize: "10pt" }}>
            <span>{t('sales.details.subtotal')}</span><span>{fmt(subtotal)}</span>
          </div>
          {discount_amount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#dc2626", fontSize: "10pt" }}>
              <span>{t('sales.details.discount')}</span><span>-{fmt(discount_amount)}</span>
            </div>
          )}
          {tax_amount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#0f172a", fontSize: "10pt" }}>
              <span>{t('sales.details.tax')} ({settings?.tax_percentage ?? 0}%)</span><span style={{ fontWeight: 800 }}>{fmt(tax_amount)}</span>
            </div>
          )}
          <div style={{
            display: "flex", justifyContent: "space-between",
            padding: "10px 14px", marginTop: "6px",
            background: "#1e3a8a", color: "#fff", borderRadius: "8px",
            fontSize: "13pt", fontWeight: 900,
          }}>
            <span>{t('common.total').toUpperCase()}</span><span>{fmt(total_amount)}</span>
          </div>
        </div>
      </div>

      {/* Payment details */}
      {payments && payments.length > 0 && (
        <div style={{ marginBottom: "20px", background: "#f0fdf4", padding: "12px 18px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
          <div style={{ fontSize: "8pt", fontWeight: 900, color: "#166534", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>{t('sales.payments.modal_title')}</div>
          {payments.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "10pt" }}>
              <span style={{ textTransform: "capitalize" }}>{p.payment_method}</span>
              <span style={{ fontWeight: 900 }}>{fmt(p.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{
        marginTop: "24px",
        border: "1px solid #cbd5e1",
        borderRadius: "10px",
        padding: "14px 16px",
        pageBreakInside: "avoid",
      }}>
        <div style={{ fontSize: "8pt", fontWeight: 900, color: "#334155", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
          Goods handover and credit confirmation
        </div>
        <p style={{ margin: "0 0 18px", fontSize: "9pt", lineHeight: 1.45, color: "#0f172a" }}>
          By signing below, the prepared goods, received goods, and checked invoice are confirmed. For credit sales, the receiver accepts responsibility to pay the unpaid balance according to the agreed terms.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
          {signatureFields.map((field) => (
            <div key={field.label} style={{ minHeight: "76px" }}>
              <div style={{ height: "34px", borderBottom: "1.5px solid #0f172a", fontSize: "10pt", fontWeight: 700, color: "#0f172a" }}>
                {field.name}
              </div>
              <div style={{ marginTop: "6px", fontSize: "8pt", fontWeight: 900, color: "#334155", textTransform: "uppercase" }}>{field.label}</div>
              <div style={{ marginTop: "8px", fontSize: "8pt", color: "#475569" }}>Date: ____ / ____ / ______</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: "1px solid #e2e8f0", paddingTop: "12px",
        marginTop: "32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: "9pt", color: "#334155",
      }}>
        <span>{t('sales.receipt.footer1')}</span>
        <div style={{ padding: "8px", border: "1px dashed #cbd5e1", borderRadius: "4px", textAlign: "center", fontSize: "8pt" }}>
           [ QR CODE ]
        </div>
        <span>{t('sales.receipt.printed_at')} {new Date().toLocaleString()}</span>
      </div>
    </div>
  );
}
