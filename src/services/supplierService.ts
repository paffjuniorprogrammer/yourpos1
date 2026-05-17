import { ensureSupabaseConfigured } from "./supabaseUtils";
import { db } from "../lib/db";

// Performance cache
let suppliersCache: { data: SupplierRecord[], timestamp: number } | null = null;
const CACHE_DURATION_MS = 30000; // 30 seconds
const FAST_CACHE_TIMEOUT_MS = 5000;

function withFastCacheTimeout<T>(promise: PromiseLike<T>) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Network timeout, using local cache.")), FAST_CACHE_TIMEOUT_MS),
    ),
  ]);
}

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

function mapSupplierPayload(values: SupplierFormValues, businessId?: string) {
  return {
    name: values.name.trim(),
    business_id: businessId,
    contact_name: values.contact_name.trim() || null,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
  };
}

export async function listSuppliers() {
  const isOnline = navigator.onLine;

  if (isOnline) {
    try {
      const client = await ensureSupabaseConfigured();
      const { data, error } = await withFastCacheTimeout(client
        .from("suppliers")
        .select("*")
        .order("created_at", { ascending: false }));

      if (error) {
        throw error;
      }

      const result = (data ?? []) as SupplierRecord[];
      await db.cached_suppliers.bulkPut(result.map((supplier) => ({
        id: supplier.id,
        data: supplier,
        updated_at: new Date().toISOString(),
      })));
      return result;
    } catch (error: any) {
      if (error?.message !== "Failed to fetch" && !error?.message?.includes("network") && !error?.message?.includes("timeout")) {
        throw error;
      }
    }
  }

  const cached = await db.cached_suppliers.toArray();
  return cached.map((record) => record.data) as SupplierRecord[];
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
      const purchasePaid = purchase.purchase_payments?.reduce(
        (sum: number, payment: any) => sum + Number(payment.amount || 0),
        0,
      ) || 0;
      purchase.purchase_payments?.forEach((payment: any) => {
        total_paid += Number(payment.amount || 0);
      });
      if (purchasePaid === 0 && purchase.payment_status === "paid") {
        total_paid += Number(purchase.total_cost || 0);
      }
    });

    return {
      ...supplier,
      total_supplied,
      unpaid_balance: Math.max(0, total_supplied - total_paid),
    };
  }) as SupplierMetrics[];
}

export async function createSupplier(values: SupplierFormValues, businessId: string) {
  // Validate required fields
  const name = (values.name || '').trim();
  const phone = (values.phone || '').trim();
  const address = (values.address || '').trim();

  if (!name) {
    throw new Error("Supplier name is required.");
  }

  if (!phone) {
    throw new Error("Supplier phone number is required.");
  }

  if (!address) {
    throw new Error("Supplier address is required.");
  }

  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("suppliers")
    .insert(mapSupplierPayload(values, businessId))
    .select("*")
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error("Supplier with this name already exists.");
    }
    throw error;
  }

  suppliersCache = null; // Invalidate
  return data as SupplierRecord;
}

export async function updateSupplier(supplierId: string, values: SupplierFormValues) {
  // Validate required fields
  const name = (values.name || '').trim();
  const phone = (values.phone || '').trim();
  const address = (values.address || '').trim();

  if (!name) {
    throw new Error("Supplier name is required.");
  }

  if (!phone) {
    throw new Error("Supplier phone number is required.");
  }

  if (!address) {
    throw new Error("Supplier address is required.");
  }

  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("suppliers")
    .update(mapSupplierPayload(values))
    .eq("id", supplierId)
    .select("*")
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
