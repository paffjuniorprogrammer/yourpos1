import { ensureSupabaseConfigured } from "./supabaseUtils";
import { db } from "../lib/db";

// Performance cache
let customersCache: { data: CustomerRecord[], timestamp: number } | null = null;
const CACHE_DURATION_MS = 30000; // 30 seconds

export interface CustomerRecord {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  credit_limit?: number | null;
  discount_percentage?: number | null;
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
  credit_limit?: string | number | null;
  discount_percentage?: string | number | null;
}

function mapCustomerPayload(values: CustomerFormValues, businessId?: string) {
  const creditLimit = values.credit_limit !== undefined && values.credit_limit !== null && values.credit_limit !== ''
    ? Number(values.credit_limit)
    : null;
  const discountPct = values.discount_percentage !== undefined && values.discount_percentage !== null && values.discount_percentage !== ''
    ? Number(values.discount_percentage)
    : 0;

  return {
    full_name: values.full_name.trim(),
    business_id: businessId,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
    credit_limit: creditLimit,
    discount_percentage: discountPct,
  };
}

export async function checkCustomerExists(full_name: string, phone: string, email: string, businessId: string, excludeId?: string) {
  const client = await ensureSupabaseConfigured();
  const normalizedName = full_name.trim();
  const normalizedPhone = phone.trim();
  const normalizedEmail = email.trim();

  const conditions = [];
  if (normalizedName) conditions.push(`full_name.ilike.${normalizedName}`);
  if (normalizedPhone) conditions.push(`phone.eq.${normalizedPhone}`);
  if (normalizedEmail) conditions.push(`email.eq.${normalizedEmail}`);

  if (conditions.length === 0) {
    return false;
  }

  let query = client
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .or(conditions.join(","));

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return Array.isArray(data) && data.length > 0;
}

const DEMO_CUSTOMERS_LIST: CustomerMetrics[] = [
  { id: "demo-cust-1", full_name: "Jean Paul Ndayisaba", phone: "+250 788 123 456", email: "jeanpaul@gmail.com", address: "Kigali, Nyarugenge", credit_limit: 150000, discount_percentage: 5, total_spent: 420000, unpaid_balance: 65000, created_at: new Date().toISOString() },
  { id: "demo-cust-2", full_name: "Marie Claire Uwase", phone: "+250 789 234 567", email: "uwase.claire@yahoo.com", address: "Kicukiro, Niboye", credit_limit: 200000, discount_percentage: 0, total_spent: 310000, unpaid_balance: 0, created_at: new Date().toISOString() },
  { id: "demo-cust-3", full_name: "Eric Mugisha (VIP)", phone: "+250 783 345 678", email: "mugisha.eric@outlook.com", address: "Gasabo, Kimironko", credit_limit: 500000, discount_percentage: 10, total_spent: 980000, unpaid_balance: 120000, created_at: new Date().toISOString() },
  { id: "demo-cust-4", full_name: "Aline Mukamana", phone: "+250 790 456 789", email: "aline.m@gmail.com", address: "Gasabo, Gisozi", credit_limit: 100000, discount_percentage: 0, total_spent: 175000, unpaid_balance: 0, created_at: new Date().toISOString() },
];

export async function listCustomers() {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_CUSTOMERS_LIST;
  }
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
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_CUSTOMERS_LIST;
  }
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

export async function createCustomer(values: CustomerFormValues, businessId: string) {
  const fullName = (values.full_name || '').trim();
  const phone = (values.phone || '').trim();
  const address = (values.address || '').trim();
  const email = (values.email || '').trim();

  if (!fullName) {
    throw new Error("Customer name is required.");
  }

  if (!phone) {
    throw new Error("Customer phone number is required.");
  }

  if (!address) {
    throw new Error("Customer address is required.");
  }

  const exists = await checkCustomerExists(fullName, phone, email, businessId);
  if (exists) {
    throw new Error("Customer with this name or contact already exists.");
  }

  const isOnline = navigator.onLine;

  if (isOnline) {
    try {
      const client = await ensureSupabaseConfigured();
      const { data, error } = await client
        .from("customers")
        .insert(mapCustomerPayload(values, businessId))
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      customersCache = null;
      
      // Update local cache too
      if (data) {
        await db.cached_customers.put({ id: data.id, data });
      }

      return data as CustomerRecord;
    } catch (err: any) {
      if (err?.message !== 'Failed to fetch' && !err?.message?.includes('network')) {
        throw err;
      }
    }
  }

  // OFFLINE FALLBACK
  const localId = crypto.randomUUID();
  const now = new Date().toISOString();
  const customerData = {
    ...mapCustomerPayload(values),
    id: localId,
    created_at: now
  };

  await db.pending_actions.add({
    id: localId,
    type: 'customer',
    payload: values,
    status: 'pending',
    created_at: now
  });

  // Put in local cache so it shows up in search
  await db.cached_customers.add({
    id: localId,
    data: customerData
  });

  return customerData as CustomerRecord;
}

export async function pushCustomerToSupabase(values: CustomerFormValues) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("customers")
    .insert(mapCustomerPayload(values))
    .select("*")
    .single();

  if (error) throw error;
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
  const fullName = (values.full_name || '').trim();
  const phone = (values.phone || '').trim();
  const address = (values.address || '').trim();
  const email = (values.email || '').trim();

  if (!fullName) {
    throw new Error("Customer name is required.");
  }

  if (!phone) {
    throw new Error("Customer phone number is required.");
  }

  if (!address) {
    throw new Error("Customer address is required.");
  }

  const client = await ensureSupabaseConfigured();
  const { data: existingCustomer, error: existingError } = await client
    .from("customers")
    .select("business_id")
    .eq("id", customerId)
    .single();

  if (existingError || !existingCustomer) {
    throw new Error("Customer not found.");
  }

  const exists = await checkCustomerExists(fullName, phone, email, existingCustomer.business_id, customerId);
  if (exists) {
    throw new Error("Another customer with this name or contact already exists.");
  }

  const { data, error } = await client
    .from("customers")
    .update(mapCustomerPayload(values))
    .eq("id", customerId)
    .select("*")
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
