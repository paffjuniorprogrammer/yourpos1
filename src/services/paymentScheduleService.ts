import { ensureSupabaseConfigured } from "./supabaseUtils";

export interface PaymentSchedule {
  id: string;
  purchase_id: string;
  supplier_id: string | null;
  amount_due: number;
  due_date: string;
  notes: string | null;
  status: "pending" | "paid" | "overdue";
  created_at: string;
  // joined
  suppliers?: { name: string } | null;
  purchases?: { purchase_date: string } | null;
}

export interface CreateScheduleInput {
  purchase_id: string;
  supplier_id?: string;
  amount_due: number;
  due_date: string;
  notes?: string;
}

export async function listPaymentSchedules(): Promise<PaymentSchedule[]> {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("supplier_payment_schedules")
    .select(`*, suppliers(name), purchases(purchase_date)`)
    .order("due_date", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as PaymentSchedule[];
}

export async function createPaymentSchedule(input: CreateScheduleInput) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("supplier_payment_schedules")
    .insert({
      purchase_id:  input.purchase_id,
      supplier_id:  input.supplier_id ?? null,
      amount_due:   input.amount_due,
      due_date:     input.due_date,
      notes:        input.notes ?? null,
      status:       "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data as PaymentSchedule;
}

export async function markSchedulePaid(id: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client
    .from("supplier_payment_schedules")
    .update({ status: "paid" })
    .eq("id", id);
  if (error) throw error;
}

export async function deletePaymentSchedule(id: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client
    .from("supplier_payment_schedules")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Auto-mark overdue schedules (call on page load) */
export async function autoMarkOverdue() {
  const client = await ensureSupabaseConfigured();
  const today = new Date().toISOString().split("T")[0];
  await client
    .from("supplier_payment_schedules")
    .update({ status: "overdue" })
    .eq("status", "pending")
    .lt("due_date", today);
}
