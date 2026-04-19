import { ensureSupabaseConfigured } from "./supabaseUtils";

// Performance cache
let customersCache: { data: CustomerRecord[], timestamp: number } | null = null;
const CACHE_DURATION_MS = 30000; // 30 seconds

export interface CustomerRecord {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
}

export interface CustomerMetrics extends CustomerRecord {
  total_spent: number;
  unpaid_balance: number;
  sales?: any[];
}

export interface CustomerFormValues {
  full_name: string;
  phone: string;
  email: string;
  address: string;
}

function mapCustomerPayload(values: CustomerFormValues) {
  return {
    full_name: values.full_name.trim(),
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
  };
}

export async function listCustomers() {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as CustomerRecord[];
}

export async function listCustomersWithMetrics() {
  const client = await ensureSupabaseConfigured();
  
  // Fetch customers with their sales and the payments for those sales
  const { data, error } = await client
    .from("customers")
    .select(`
      *,
      sales (
        id,
        total_amount,
        payment_status,
        sale_payments (
          amount
        )
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((customer: any) => {
    let total_spent = 0;
    let total_paid = 0;

    customer.sales?.forEach((sale: any) => {
      total_spent += Number(sale.total_amount || 0);
      sale.sale_payments?.forEach((payment: any) => {
        total_paid += Number(payment.amount || 0);
      });
    });

    return {
      ...customer,
      total_spent,
      unpaid_balance: Math.max(0, total_spent - total_paid),
    };
  }) as CustomerMetrics[];
}

export async function createCustomer(values: CustomerFormValues) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("customers")
    .insert(mapCustomerPayload(values))
    .select()
    .single();

  if (error) {
    throw error;
  }

  customersCache = null;
  return data as CustomerRecord;
}

export async function getCustomer(customerId: string) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();

  if (error) {
    throw error;
  }

  return data as CustomerRecord;
}

export async function updateCustomer(customerId: string, values: CustomerFormValues) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("customers")
    .update(mapCustomerPayload(values))
    .eq("id", customerId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  customersCache = null;
  return data as CustomerRecord;
}

export async function deleteCustomer(customerId: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client.from("customers").delete().eq("id", customerId);

  if (error) {
    throw error;
  }
  customersCache = null;
}
