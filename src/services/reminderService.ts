import { formatCurrency } from "../lib/format";
import { ensureSupabaseConfigured } from "./supabaseUtils";
import { getVatSummary } from "./vatService";

export type BusinessReminder = {
  id: string;
  type: "supplier_due" | "supplier_overdue" | "customer_credit" | "vat_due_soon" | "vat_overdue" | "vat_credit" | "tax_settings_missing";
  title: string;
  message: string;
  severity: "info" | "warning" | "error";
  dueDate?: string;
  amount?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / DAY_MS);
}

export async function getBusinessReminders(): Promise<BusinessReminder[]> {
  const client = await ensureSupabaseConfigured();
  const now = new Date();
  const today = toDateOnly(now);
  const fiveDaysAgo = new Date(now.getTime() - 5 * DAY_MS).toISOString();
  const nextThreeDays = toDateOnly(new Date(now.getTime() + 3 * DAY_MS));

  const [
    { data: schedules, error: schedulesError },
    { data: creditSales, error: creditSalesError },
  ] = await Promise.all([
    client
      .from("supplier_payment_schedules")
      .select("id, amount_due, due_date, status, suppliers(name)")
      .in("status", ["pending", "overdue"])
      .lte("due_date", nextThreeDays)
      .order("due_date", { ascending: true })
      .limit(10),
    client
      .from("sales")
      .select("id, sale_number, total_amount, payment_status, created_at, customers(full_name), sale_payments(amount)")
      .neq("payment_status", "paid")
      .lte("created_at", fiveDaysAgo)
      .order("created_at", { ascending: true })
      .limit(10),
  ]);

  if (schedulesError) throw schedulesError;
  if (creditSalesError) throw creditSalesError;

  const supplierReminders: BusinessReminder[] = (schedules || []).map((schedule: any) => {
    const isOverdue = schedule.status === "overdue" || schedule.due_date < today;
    const supplierName = schedule.suppliers?.name || "Supplier";
    const amount = Number(schedule.amount_due || 0);

    return {
      id: `supplier-${schedule.id}`,
      type: isOverdue ? "supplier_overdue" : "supplier_due",
      title: isOverdue ? "Supplier payment overdue" : "Supplier payment due soon",
      message: `${supplierName} is ${isOverdue ? "overdue" : "due"} for ${formatCurrency(amount)} on ${new Date(schedule.due_date).toLocaleDateString()}.`,
      severity: isOverdue ? "error" : "warning",
      dueDate: schedule.due_date,
      amount,
    };
  });

  const customerReminders: BusinessReminder[] = (creditSales || [])
    .map((sale: any) => {
      const paid = Array.isArray(sale.sale_payments)
        ? sale.sale_payments.reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)
        : 0;
      const remaining = Math.max(0, Number(sale.total_amount || 0) - paid);

      return {
        sale,
        remaining,
      };
    })
    .filter(({ remaining }) => remaining > 0)
    .map(({ sale, remaining }: any) => {
      const ageDays = daysBetween(new Date(sale.created_at), now);
      const customerName = sale.customers?.full_name || "Customer";

      return {
        id: `customer-credit-${sale.id}`,
        type: "customer_credit",
        title: "Customer credit reminder",
        message: `${customerName} has not paid ${formatCurrency(remaining)} for ${ageDays} days (${sale.sale_number}).`,
        severity: "warning",
        dueDate: sale.created_at,
        amount: remaining,
      };
    });

  const vatReminders: BusinessReminder[] = [];

  try {
    const vatSummary = await getVatSummary(now);
    if (!vatSummary.businessInfo.businessName || !vatSummary.businessInfo.tinNumber) {
      vatReminders.push({
        id: "tax-settings-missing",
        type: "tax_settings_missing",
        title: "Tax settings not configured",
        message: "Add business name and TIN in Tax Settings so VAT reports are ready for filing.",
        severity: "warning",
      });
    }

    if (!vatSummary.disabled) {
      const periodEnd = new Date(vatSummary.periodEnd);
      const daysToEnd = daysBetween(now, periodEnd);
      if (daysToEnd >= 0 && daysToEnd <= 5) {
        vatReminders.push({
          id: `vat-due-soon-${vatSummary.periodLabel}`,
          type: "vat_due_soon",
          title: "VAT return due soon",
          message: `${vatSummary.periodLabel} closes in ${daysToEnd} day${daysToEnd === 1 ? "" : "s"}. VAT payable is ${formatCurrency(vatSummary.vatPayable)}.`,
          severity: "warning",
          dueDate: vatSummary.periodEnd,
          amount: vatSummary.vatPayable,
        });
      }

      if (now.getTime() > periodEnd.getTime() + 7 * DAY_MS && vatSummary.vatPayable > 0) {
        vatReminders.push({
          id: `vat-overdue-${vatSummary.periodLabel}`,
          type: "vat_overdue",
          title: "VAT filing overdue",
          message: `${vatSummary.periodLabel} has VAT payable of ${formatCurrency(vatSummary.vatPayable)}. Review and file the return.`,
          severity: "error",
          dueDate: vatSummary.periodEnd,
          amount: vatSummary.vatPayable,
        });
      }

      if (vatSummary.vatCredit > 0) {
        vatReminders.push({
          id: `vat-credit-${vatSummary.periodLabel}`,
          type: "vat_credit",
          title: "VAT credit available",
          message: `${formatCurrency(vatSummary.vatCredit)} can be carried forward to the next period.`,
          severity: "info",
          amount: vatSummary.vatCredit,
        });
      }
    }
  } catch (error) {
    console.warn("Failed to load VAT reminders:", error);
  }

  return [...vatReminders, ...supplierReminders, ...customerReminders].slice(0, 8);
}
