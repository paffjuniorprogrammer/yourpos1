import { ensureSupabaseConfigured } from "./supabaseUtils";

// Performance cache
let suppliersCache: { data: SupplierRecord[], timestamp: number } | null = null;
const CACHE_DURATION_MS = 30000; // 30 seconds

export interface SupplierRecord {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tin_number: string | null;
  payment_term: string | null;
  bank_account: string | null;
  created_at: string;
}

export interface SupplierMetrics extends SupplierRecord {
  total_supplied: number;
  unpaid_balance: number;
}

export interface SupplierFormValues {
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
}

function mapSupplierPayload(values: SupplierFormValues) {
  return {
    name: values.name.trim(),
    contact_name: values.contact_name.trim() || null,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
  };
}

export async function listSuppliers() {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("suppliers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as SupplierRecord[];
}

export async function listSuppliersWithMetrics() {
  const client = await ensureSupabaseConfigured();
  
  // Fetch suppliers with their purchases and the payments for those purchases
  const { data, error } = await client
    .from("suppliers")
    .select(`
      *,
      purchases (
        id,
        total_cost,
        payment_status,
        purchase_payments (
          amount
        )
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((supplier: any) => {
    let total_supplied = 0;
    let total_paid = 0;

    supplier.purchases?.forEach((purchase: any) => {
      total_supplied += Number(purchase.total_cost || 0);
      purchase.purchase_payments?.forEach((payment: any) => {
        total_paid += Number(payment.amount || 0);
      });
    });

    return {
      ...supplier,
      total_supplied,
      unpaid_balance: Math.max(0, total_supplied - total_paid),
    };
  }) as SupplierMetrics[];
}

export async function createSupplier(values: SupplierFormValues) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("suppliers")
    .insert(mapSupplierPayload(values))
    .select()
    .single();

  if (error) {
    throw error;
  }

  suppliersCache = null; // Invalidate
  return data as SupplierRecord;
}

export async function updateSupplier(supplierId: string, values: SupplierFormValues) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("suppliers")
    .update(mapSupplierPayload(values))
    .eq("id", supplierId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  suppliersCache = null; // Invalidate
  return data as SupplierRecord;
}

export async function deleteSupplier(supplierId: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client.from("suppliers").delete().eq("id", supplierId);

  if (error) {
    throw error;
  }
  suppliersCache = null; // Invalidate
}
