import { ensureSupabaseConfigured } from "./supabaseUtils";
import { db } from "../lib/db";

// Performance cache
let suppliersCache: { data: SupplierRecord[], timestamp: number } | null = null;
const CACHE_DURATION_MS = 30000; // 30 seconds
const FAST_CACHE_TIMEOUT_MS = 800;

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
  is_vat_registered?: boolean;
  vat_registration_number?: string | null;
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
  tin_number?: string;
  is_vat_registered?: boolean;
  vat_registration_number?: string;
}

function mapSupplierPayload(values: SupplierFormValues, businessId?: string) {
  return {
    name: values.name.trim(),
    business_id: businessId,
    contact_name: values.contact_name.trim() || null,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
    tin_number: values.tin_number?.trim() || null,
    is_vat_registered: values.is_vat_registered !== false,
    vat_registration_number: values.vat_registration_number?.trim() || null,
  };
}

export async function checkSupplierExists(name: string, phone: string, businessId: string, excludeId?: string) {
  const client = await ensureSupabaseConfigured();
  const normalizedName = name.trim();
  const normalizedPhone = phone.trim();

  let query = client
    .from("suppliers")
    .select("id")
    .eq("business_id", businessId)
    .or(`name.ilike.${normalizedName},phone.eq.${normalizedPhone}`);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return Array.isArray(data) && data.length > 0;
}

const DEMO_SUPPLIERS_LIST: SupplierMetrics[] = [
  { id: "demo-sup-1", name: "Inyange Industries Ltd", contact_name: "Gatera Alex", phone: "+250 788 555 111", email: "sales@inyangeindustries.com", address: "Masaka, Kicukiro, Kigali", tin_number: "100234567", is_vat_registered: true, vat_registration_number: "VAT-100234567", payment_term: "30 days", bank_account: "BK 00012345678", created_at: new Date().toISOString(), total_supplied: 3500000, unpaid_balance: 200000 },
  { id: "demo-sup-2", name: "Bakhresa Grain Millers", contact_name: "Said Omar", phone: "+250 788 666 222", email: "orders@bakhresa.rw", address: "Special Economic Zone, Kigali", tin_number: "100345678", is_vat_registered: true, vat_registration_number: "VAT-100345678", payment_term: "15 days", bank_account: "I&M 00098765432", created_at: new Date().toISOString(), total_supplied: 2800000, unpaid_balance: 120000 },
  { id: "demo-sup-3", name: "Sulfo Rwanda Industries", contact_name: "Kamali Jean", phone: "+250 788 777 333", email: "contact@sulfo.com", address: "Nyarugenge, Kigali", tin_number: "100456789", is_vat_registered: true, vat_registration_number: "VAT-100456789", payment_term: "Cash", bank_account: "Cogebanque 000456123", created_at: new Date().toISOString(), total_supplied: 1200000, unpaid_balance: 0 },
];

export async function listSuppliers(businessId?: string) {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_SUPPLIERS_LIST;
  }
  const isOnline = navigator.onLine;

  if (isOnline) {
    try {
      const client = await ensureSupabaseConfigured();
      let query = client
        .from("suppliers")
        .select("*")
        .order("created_at", { ascending: false });

      if (businessId) {
        query = query.eq("business_id", businessId);
      }

      const { data, error } = await withFastCacheTimeout(query);

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
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_SUPPLIERS_LIST;
  }
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

  const exists = await checkSupplierExists(name, phone, businessId);
  if (exists) {
    throw new Error("Supplier with this name or phone already exists.");
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
  const { data: existingSupplier, error: existingError } = await client
    .from("suppliers")
    .select("business_id")
    .eq("id", supplierId)
    .single();

  if (existingError || !existingSupplier) {
    throw new Error("Supplier not found.");
  }

  const exists = await checkSupplierExists(name, phone, existingSupplier.business_id, supplierId);
  if (exists) {
    throw new Error("Another supplier with this name or phone already exists.");
  }

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
