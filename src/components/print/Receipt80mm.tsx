import type { ShopSettingsRecord } from "../../types/database";
import { useTranslation } from "react-i18next";

interface ReceiptItem {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  discount_amount?: number;
  bulk_breakdown?: {
    bulkPackages: number;
    bulkQty: number;
    bulkPrice: number;
    remainingUnits: number;
    unitPrice: number;
  };
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
  const { t } = useTranslation();
  const fmt = (v: number) => v.toLocaleString("fr-RW");
  const date = new Date(created_at);

  const WIDTH = 32;

  const padRight = (str: string, len: number) => (str + " ".repeat(Math.max(0, len - str.length))).slice(0, len);
  const padLeft = (str: string, len: number) => (" ".repeat(Math.max(0, len - str.length)) + str).slice(-len);
  const center = (str: string, len: number) => {
    const pad = Math.max(0, len - str.length);
    const left = Math.floor(pad / 2);
    return " ".repeat(left) + str + " ".repeat(pad - left);
  };

  const line = (char: string) => char.repeat(WIDTH);

  let output: string[] = [];

  output.push(line("="));
  output.push(center((settings?.shop_name || "RETAIL POS").toUpperCase(), WIDTH));
  
  const addressLine = [settings?.address, settings?.contact_phone].filter(Boolean).join(" , ");
  if (addressLine) {
    output.push(center(addressLine, WIDTH));
  }
  
  output.push(line("="));
  output.push(`Receipt No: ${isReturn ? return_number : sale_number}`);
  output.push(`Date: ${date.toLocaleDateString('en-GB')}`);
  output.push(`Cashier: ${cashier_name || "—"}`);
  if (customer_name) {
    output.push(`Customer: ${customer_name}`);
  }
  output.push("");
  output.push(line("="));
  
  // "Item              Qty    Price" -> "Item" (18), "Qty" (4), "Price" (10 = right align)
  // 18 + 4 + 10 = 32
  output.push(padRight("Item", 18) + padLeft("Qty", 4) + padLeft("Price", 10));
  output.push(line("-"));

  items.forEach(item => {
    // If name > 17 chars, we could truncate or wrap. Truncate for now.
    const nameStr = item.name.substring(0, 17);
    const qtyStr = item.quantity.toString();
    const priceStr = fmt(item.line_total);
    output.push(padRight(nameStr, 18) + padLeft(qtyStr, 4) + padLeft(priceStr, 10));
  });

  output.push(line("-"));
  output.push(padRight("Subtotal", 16) + padLeft(fmt(subtotal), 16));
  
  if (discount_amount > 0) {
    output.push(padRight("Discount", 16) + padLeft("-" + fmt(discount_amount), 16));
  }
  
  if (tax_amount > 0) {
    output.push(padRight("Tax", 16) + padLeft(fmt(tax_amount), 16));
  }
  
  output.push(padRight("TOTAL", 16) + padLeft(fmt(total_amount), 16));
  output.push(line("="));

  if (payments && payments.length > 0) {
    payments.forEach(p => {
      output.push(`Payment: ${p.payment_method.charAt(0).toUpperCase() + p.payment_method.slice(1)}`);
      output.push(`Amount: ${fmt(p.amount)}`);
    });
  } else if (payment_method) {
    output.push(`Payment: ${payment_method.charAt(0).toUpperCase() + payment_method.slice(1)}`);
  }
  
  output.push(`Cashier: ${cashier_name || "—"}`);
  output.push(line("="));
  output.push(center(t('sales.receipt.footer1') || "THANK YOU FOR SHOPPING", WIDTH));
  output.push(center("[ QR CODE ]", WIDTH));
  output.push(line("="));

  return (
    <div
      id="receipt-80mm"
      style={{
        width: "80mm",
        padding: "0",
        margin: "0",
        background: "#fff",
        pageBreakInside: "avoid",
      }}
    >
      <pre style={{
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: "11px",
        lineHeight: "1.3",
        color: "#000",
        margin: "0",
        padding: "3mm",
        whiteSpace: "pre",
        wordBreak: "break-all",
        pageBreakInside: "avoid",
      }}>{output.join("\n")}</pre>
    </div>
  );
}
