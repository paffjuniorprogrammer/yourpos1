import type {
  DayClosureRecord,
  PaymentMethod,
  PaymentStatus,
  PosCustomerRecord,
  PosProductRecord,
  PosSaleItemInput,
  PosSalePaymentInput,
  SaleItemRecord,
  SalePaymentRecord,
  SaleRecord,
  ShopSettingsRecord,
} from "../types/database";
import { ensureSupabaseConfigured } from "./supabaseUtils";
import { db } from "../lib/db";

export type CreatePosSaleInput = {
  customer_id: string | null;
  cashier_id: string;
  business_id: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  notes?: string;
  discount_amount: number;
  discount_type: 'percentage' | 'fixed' | null;
  items: (PosSaleItemInput & { discount_amount?: number; discount_type?: string | null })[];
  payments: PosSalePaymentInput[];
  location_id?: string | null;
};

type CloseDaySummary = {
  cash_amount: number;
  momo_amount: number;
  bank_amount: number;
  card_amount: number;
  credit_amount: number;
  total_amount: number;
};

const FAST_CACHE_TIMEOUT_MS = 5000;

function withFastCacheTimeout<T>(promise: PromiseLike<T>) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Network timeout, using local cache.")), FAST_CACHE_TIMEOUT_MS),
    ),
  ]);
}

export async function listPosProducts(locationId?: string | null, limit = 500) {
  if (navigator.onLine) {
    try {
      const client = await ensureSupabaseConfigured();
      
      // Use a lean select to speed up transfer, conditionally including product_stocks
      const selectQuery = locationId 
        ? `id, name, barcode, selling_price, stock_quantity, reorder_level, image_url, bulk_quantity, bulk_price, product_stocks(quantity, location_id)`
        : `id, name, barcode, selling_price, stock_quantity, reorder_level, image_url, bulk_quantity, bulk_price`;

      const { data, error } = await withFastCacheTimeout(client
        .from("products")
        .select(selectQuery)
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(limit));

      if (error) {
        throw error;
      }

      const result = locationId
        ? (data || []).map((product: any) => {
          let branchStock = 0;
          if (product.product_stocks && Array.isArray(product.product_stocks)) {
            const stockEntry = product.product_stocks.find((s: any) => s.location_id === locationId);
            if (stockEntry !== undefined) {
              branchStock = stockEntry.quantity;
            }
          }
          return {
            ...product,
            stock_quantity: branchStock,
            product_stocks: undefined
          };
        }) as any[] as PosProductRecord[]
        : (data || []) as any[] as PosProductRecord[];

      await db.cached_products.bulkPut(result.map((product: any) => ({
        id: product.id,
        business_id: product.business_id ?? "unknown",
        data: product,
        updated_at: new Date().toISOString(),
      })));
      return result;
    } catch (error: any) {
      if (error?.message !== "Failed to fetch" && !error?.message?.includes("network") && !error?.message?.includes("timeout")) {
        throw error;
      }
    }
  }

  const cached = await db.cached_products.toArray();
  return cached.map((record) => record.data).filter((product) => product.is_active !== false) as PosProductRecord[];
}

export async function listPosCustomers() {
  if (navigator.onLine) {
    try {
      const client = await ensureSupabaseConfigured();
      const { data, error } = await withFastCacheTimeout(client
        .from("customers")
        .select("id, full_name, phone")
        .order("full_name", { ascending: true })
        .limit(1000));

      if (error) {
        throw error;
      }

      const result = (data || []) as PosCustomerRecord[];
      await db.cached_customers.bulkPut(result.map((customer) => ({
        id: customer.id,
        data: customer,
      })));
      return result;
    } catch (error: any) {
      if (error?.message !== "Failed to fetch" && !error?.message?.includes("network") && !error?.message?.includes("timeout")) {
        throw error;
      }
    }
  }

  const cached = await db.cached_customers.toArray();
  return cached.map((record) => record.data) as PosCustomerRecord[];
}

export async function getShopSettings(businessId?: string) {
  if (navigator.onLine) {
    try {
      const client = await ensureSupabaseConfigured();
      let query = client.from("shop_settings").select("*");
      if (businessId) {
        query = query.eq("business_id", businessId);
      } else {
        query = query.order("created_at", { ascending: true }).limit(1);
      }

      const { data, error } = await withFastCacheTimeout(query.maybeSingle());

      if (error) {
        throw error;
      }

      if (data) {
        const cacheKey = businessId ? `shop_settings_${businessId}` : "shop_settings";
        await db.cached_settings.put({ id: cacheKey, data, updated_at: new Date().toISOString() });
      }
      return data as ShopSettingsRecord;
    } catch (error: any) {
      if (error?.message !== "Failed to fetch" && !error?.message?.includes("network") && !error?.message?.includes("timeout")) {
        throw error;
      }
    }
  }

  const cacheKey = businessId ? `shop_settings_${businessId}` : "shop_settings";
  const cached = await db.cached_settings.get(cacheKey);
  return cached?.data as ShopSettingsRecord;
}

export async function pushPosSaleToSupabase(input: CreatePosSaleInput) {
  const client = await ensureSupabaseConfigured();

  const { data: saleId, error } = await client.rpc("create_sale_transaction", {
    p_sale_number: null,
    p_customer_id: input.customer_id ?? null,
    p_cashier_id: input.cashier_id,
    p_business_id: input.business_id,
    p_subtotal: input.subtotal,
    p_tax_amount: input.tax_amount,
    p_total_amount: input.total_amount,
    p_payment_method: input.payment_method ?? null,
    p_payment_status: input.payment_status,
    p_notes: input.notes ?? null,
    p_location_id: input.location_id ?? null,
    p_items: input.items,
    p_payments: input.payments ?? [],
    p_discount_amount: input.discount_amount ?? 0,
    p_discount_type: input.discount_type ?? null
  });

  if (error) {
    throw error;
  }

  const sale_id = String(saleId);

  // Fetch the full record back for consistency
  const { data: sale, error: saleFetchError } = await client
    .from("sales")
    .select("*")
    .eq("id", sale_id)
    .single();

  if (saleFetchError) throw saleFetchError;

  const { data: items, error: itemsFetchError } = await client
    .from("sale_items")
    .select("*")
    .eq("sale_id", sale_id);

  if (itemsFetchError) throw itemsFetchError;

  const { data: payments, error: paymentsError } = await client
    .from("sale_payments")
    .select("*")
    .eq("sale_id", sale_id);

  if (paymentsError) throw paymentsError;

  return {
    sale: sale as SaleRecord,
    items: (items ?? []) as SaleItemRecord[],
    payments: (payments ?? []) as SalePaymentRecord[],
  };
}

export async function createPosSale(input: CreatePosSaleInput) {
  const isOnline = navigator.onLine;

  if (isOnline) {
    try {
      return await pushPosSaleToSupabase(input);
    } catch (err: any) {
      if (err?.message !== 'Failed to fetch' && !err?.message?.includes('network')) {
        throw err;
      }
      console.warn("Network error during checkout! Falling back to checkout queue...");
    }
  }

  // Fallback to IndexedDB
  const localSaleId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.pending_actions.add({
    id: localSaleId,
    type: 'sale',
    payload: input as any, 
    status: 'pending',
    created_at: now
  });

  await db.pending_sales.add({
    id: localSaleId,
    type: 'sale',
    payload: input as any,
    status: 'pending',
    created_at: now
  });

  // Mock successful response to keep UI flowing
  return {
    sale: {
      id: localSaleId,
      business_id: input.business_id,
      sale_number: `OFFLINE-${localSaleId.split('-')[0].toUpperCase()}`,
      status: 'completed',
      customer_id: input.customer_id,
      cashier_id: input.cashier_id,
      location_id: input.location_id ?? null,
      subtotal: input.subtotal,
      tax_amount: input.tax_amount,
      total_amount: input.total_amount,
      payment_method: input.payment_method,
      payment_status: input.payment_status,
      notes: input.notes ?? null,
      created_at: now,
    } as SaleRecord,
    items: input.items.map(it => ({
      id: crypto.randomUUID(),
      sale_id: localSaleId,
      ...it
    })) as SaleItemRecord[],
    payments: input.payments.map(p => ({
      id: crypto.randomUUID(),
      sale_id: localSaleId,
      ...p,
      paid_at: now
    })) as SalePaymentRecord[]
  };
}

export async function checkOpenRegister(userId: string, locationId: string) {
  const client = await ensureSupabaseConfigured();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await client
    .from('day_closures')
    .select('*')
    .eq('user_id', userId)
    .eq('location_id', locationId)
    .eq('closing_date', today)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function pushRegisterOpenToSupabase(payload: any) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client
    .from('day_closures')
    .upsert(payload, { onConflict: 'user_id, closing_date, location_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function openRegister(userId: string, businessId: string, locationId: string, startingAmount: number) {
  const payload = {
    user_id: userId,
    business_id: businessId,
    location_id: locationId,
    closing_date: new Date().toISOString().split('T')[0],
    opening_cash: startingAmount,
    cash_amount: 0,
    momo_amount: 0,
    bank_amount: 0,
    card_amount: 0,
    credit_amount: 0,
    total_amount: 0,
    status: 'open'
  };

  const isOnline = navigator.onLine;
  if (isOnline) {
    try {
      await pushRegisterOpenToSupabase(payload);
    } catch (e) {
      console.warn("Offline register open fallback");
    }
  }

  // Always track locally for sync if needed
  await db.pending_actions.add({
    id: crypto.randomUUID(),
    type: 'register_open',
    payload,
    status: 'pending',
    created_at: new Date().toISOString()
  });

  return payload;
}

export async function getCloseDaySummary(userId: string, locationId: string): Promise<CloseDaySummary> {
  const client = await ensureSupabaseConfigured();
  const today = new Date().toISOString().split('T')[0];

  // Get all sales for today for this user/location
  const { data: sales, error } = await client
    .from('sales')
    .select('id, total_amount, payment_method, payment_status')
    .eq('cashier_id', userId)
    .eq('location_id', locationId)
    .gte('created_at', `${today}T00:00:00Z`);

  if (error) throw error;

  const summary = {
    cash_amount: 0,
    momo_amount: 0,
    bank_amount: 0,
    card_amount: 0,
    credit_amount: 0,
    total_amount: 0
  };

  sales?.forEach(sale => {
    summary.total_amount += Number(sale.total_amount);
    
    if (sale.payment_status === 'unpaid') {
      summary.credit_amount += Number(sale.total_amount);
    } else if (sale.payment_method === 'cash') {
      summary.cash_amount += Number(sale.total_amount);
    } else if (sale.payment_method === 'momo') {
      summary.momo_amount += Number(sale.total_amount);
    } else if (sale.payment_method === 'bank') {
      summary.bank_amount += Number(sale.total_amount);
    } else if (sale.payment_method === 'card') {
      summary.card_amount += Number(sale.total_amount);
    }
  });

  return summary;
}

export async function pushDayClosureToSupabase(payload: any) {
  const client = await ensureSupabaseConfigured();
  let request = client.from('day_closures').update(payload);
  request = request.eq('user_id', payload.user_id);
  request = request.eq('closing_date', payload.closing_date);

  if (payload.location_id) {
    request = request.eq('location_id', payload.location_id);
  }

  if (payload.business_id) {
    request = request.eq('business_id', payload.business_id);
  }

  const { error } = await request;
  if (error) throw error;
}

export async function createDayClosure(userId: string, businessId: string, locationId: string, summary: CloseDaySummary) {
  const payload = {
    ...summary,
    user_id: userId,
    business_id: businessId,
    location_id: locationId,
    closing_date: new Date().toISOString().split('T')[0],
    status: 'closed',
    closed_at: new Date().toISOString()
  };

  const isOnline = navigator.onLine;
  if (isOnline) {
    try {
      await pushDayClosureToSupabase(payload);
    } catch (e) {
      console.warn("Offline day closure fallback");
    }
  }

  await db.pending_actions.add({
    id: crypto.randomUUID(),
    type: 'register_close',
    payload,
    status: 'pending',
    created_at: new Date().toISOString()
  });

  return payload;
}

export async function getRecentShifts(userId: string, locationId: string, limit = 5) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from('day_closures')
    .select('*')
    .eq('user_id', userId)
    .eq('location_id', locationId)
    .eq('status', 'closed')
    .order('closing_date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}
