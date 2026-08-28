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
  vat_rate?: number;
  price_type?: "inclusive" | "exclusive";
  amount_before_vat?: number;
  output_vat?: number;
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
  credit_collected_amount: number;
  total_amount: number;
};

const FAST_CACHE_TIMEOUT_MS = 5000;

function isDuplicateRegisterOpenError(error: any) {
  return (
    error?.code === '23505' ||
    error?.status === 409 ||
    String(error?.message || '').toLowerCase().includes('duplicate key')
  );
}

function withFastCacheTimeout<T>(promise: PromiseLike<T>) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Network timeout, using local cache.")), FAST_CACHE_TIMEOUT_MS),
    ),
  ]);
}

const DEMO_PRODUCTS: PosProductRecord[] = [
  { id: "demo-prod-1", name: "Inyange Fresh Milk 1L", barcode: "600123456789", selling_price: 1200, stock_quantity: 45, reorder_level: 10, image_url: null, category_name: "Dairy", bulk_quantity: null, bulk_price: null, bulk_pricing_mode: null, bulk_discount_value: null, parent_id: null, is_parent: false, variant_combination: null },
  { id: "demo-prod-2", name: "Baking Powder 100g", barcode: "600123456790", selling_price: 800, stock_quantity: 30, reorder_level: 5, image_url: null, category_name: "Bakery", bulk_quantity: null, bulk_price: null, bulk_pricing_mode: null, bulk_discount_value: null, parent_id: null, is_parent: false, variant_combination: null },
  { id: "demo-prod-3", name: "Rwandan Coffee Beans 500g", barcode: "600123456791", selling_price: 6500, stock_quantity: 18, reorder_level: 4, image_url: null, category_name: "Beverages", bulk_quantity: null, bulk_price: null, bulk_pricing_mode: null, bulk_discount_value: null, parent_id: null, is_parent: false, variant_combination: null },
  { id: "demo-prod-4", name: "Basmati Rice 5kg", barcode: "600123456792", selling_price: 8500, stock_quantity: 25, reorder_level: 6, image_url: null, category_name: "Grains", bulk_quantity: null, bulk_price: null, bulk_pricing_mode: null, bulk_discount_value: null, parent_id: null, is_parent: false, variant_combination: null },
  { id: "demo-prod-5", name: "Sunflower Cooking Oil 3L", barcode: "600123456793", selling_price: 9200, stock_quantity: 12, reorder_level: 5, image_url: null, category_name: "Oil", bulk_quantity: null, bulk_price: null, bulk_pricing_mode: null, bulk_discount_value: null, parent_id: null, is_parent: false, variant_combination: null },
  { id: "demo-prod-6", name: "White Sugar 1kg", barcode: "600123456794", selling_price: 1500, stock_quantity: 60, reorder_level: 15, image_url: null, category_name: "Groceries", bulk_quantity: null, bulk_price: null, bulk_pricing_mode: null, bulk_discount_value: null, parent_id: null, is_parent: false, variant_combination: null },
  { id: "demo-prod-7", name: "Blueband Butter 250g", barcode: "600123456795", selling_price: 2200, stock_quantity: 22, reorder_level: 8, image_url: null, category_name: "Dairy", bulk_quantity: null, bulk_price: null, bulk_pricing_mode: null, bulk_discount_value: null, parent_id: null, is_parent: false, variant_combination: null },
  { id: "demo-prod-8", name: "Mineral Water 1.5L Pack", barcode: "600123456796", selling_price: 3500, stock_quantity: 50, reorder_level: 10, image_url: null, category_name: "Beverages", bulk_quantity: null, bulk_price: null, bulk_pricing_mode: null, bulk_discount_value: null, parent_id: null, is_parent: false, variant_combination: null },
];

export async function listPosProducts(locationId?: string | null, limit = 500) {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_PRODUCTS;
  }
  if (navigator.onLine) {
    try {
      const client = await ensureSupabaseConfigured();
      
      // Use a lean select to speed up transfer, conditionally including product_stocks
      const selectQuery = locationId 
        ? `id, business_id, name, barcode, selling_price, stock_quantity, reorder_level, image_url, bulk_quantity, bulk_price, product_stocks(quantity, location_id)`
        : `id, business_id, name, barcode, selling_price, stock_quantity, reorder_level, image_url, bulk_quantity, bulk_price`;

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
        ? (data || [])
          .filter((product: any) => {
            if (product.product_stocks && Array.isArray(product.product_stocks)) {
              return product.product_stocks.some((s: any) => s.location_id === locationId);
            }
            return true;
          })
          .map((product: any) => {
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

const DEMO_CUSTOMERS: PosCustomerRecord[] = [
  { id: "demo-cust-1", full_name: "Jean Paul Ndayisaba", phone: "+250 788 123 456", email: "jeanpaul@gmail.com", address: "Kigali, Nyarugenge", credit_limit: 150000, discount_percentage: 5 },
  { id: "demo-cust-2", full_name: "Marie Claire Uwase", phone: "+250 789 234 567", email: "uwase.claire@yahoo.com", address: "Kicukiro, Niboye", credit_limit: 200000, discount_percentage: 0 },
  { id: "demo-cust-3", full_name: "Eric Mugisha (VIP)", phone: "+250 783 345 678", email: "mugisha.eric@outlook.com", address: "Gasabo, Kimironko", credit_limit: 500000, discount_percentage: 10 },
  { id: "demo-cust-4", full_name: "Aline Mukamana", phone: "+250 790 456 789", email: "aline.m@gmail.com", address: "Gasabo, Gisozi", credit_limit: 100000, discount_percentage: 0 },
];

const DEMO_SHOP_SETTINGS: ShopSettingsRecord = {
  id: "demo-settings-id",
  business_id: "demo-business-id",
  shop_name: "Kigali Fresh Market (Demo)",
  phone: "+250 793 063 512",
  email: "demo@umucuruzipos.rw",
  address: "KN 4 Ave, Nyarugenge, Kigali, Rwanda",
  tin_number: "109876543",
  receipt_footer: "Murakoze cyane kugana Kigali Fresh Market! Karibu tena.",
  logo_url: null,
  currency: "RWF",
  tax_rate: 18,
  vat_rate: 18,
  price_type: "inclusive",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as any;

export async function listPosCustomers() {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_CUSTOMERS;
  }
  if (navigator.onLine) {
    try {
      const client = await ensureSupabaseConfigured();
      const { data, error } = await withFastCacheTimeout(client
        .from("customers")
        .select("id, full_name, phone, email, address, credit_limit, discount_percentage")
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
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_SHOP_SETTINGS;
  }
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
  const now = new Date().toISOString();

  const vatSaleUpdates = {
    vat_rate: input.vat_rate ?? 0,
    price_type: input.price_type ?? "inclusive",
    amount_before_vat: input.amount_before_vat ?? input.subtotal,
    output_vat: input.output_vat ?? input.tax_amount,
  };

  // Fire VAT updates and audit log in the background — don't await them.
  // This shaves 3–5 network round trips off the critical path.
  void Promise.all([
    client.from("sales").update(vatSaleUpdates).eq("id", sale_id),
    ...input.items.map((item: any) =>
      client
        .from("sale_items")
        .update({
          vat_rate: item.vat_rate ?? input.vat_rate ?? 0,
          amount_before_vat: item.amount_before_vat ?? item.line_total,
          output_vat: item.output_vat ?? 0,
        })
        .eq("sale_id", sale_id)
        .eq("product_id", item.product_id)
    ),
    client.from("vat_audit_transactions").insert({
      business_id: input.business_id,
      source_type: "sale",
      source_id: sale_id,
      transaction_date: now,
      vat_rate: input.vat_rate ?? 0,
      amount_before_vat: input.amount_before_vat ?? input.subtotal,
      input_vat: 0,
      output_vat: input.output_vat ?? input.tax_amount,
      total_amount: input.total_amount,
    }),
  ]).catch((err) => {
    // Non-critical background update failed — log only, don't surface to user
    console.warn("[POS] Background VAT update failed:", err);
  });

  // Build the response optimistically from input data.
  // We already have everything the UI needs (receipt, stock update, etc.).
  // This replaces 3 extra sequential DB fetch-back calls.
  const sale = {
    id: sale_id,
    business_id: input.business_id,
    sale_number: `SALE-${sale_id.split('-')[0].toUpperCase()}`,
    status: 'completed',
    customer_id: input.customer_id,
    cashier_id: input.cashier_id,
    location_id: input.location_id ?? null,
    subtotal: input.subtotal,
    tax_amount: input.tax_amount,
    vat_rate: input.vat_rate ?? 0,
    price_type: input.price_type ?? "inclusive",
    amount_before_vat: input.amount_before_vat ?? input.subtotal,
    output_vat: input.output_vat ?? input.tax_amount,
    total_amount: input.total_amount,
    discount_amount: input.discount_amount ?? 0,
    discount_type: input.discount_type ?? null,
    payment_method: input.payment_method,
    payment_status: input.payment_status,
    notes: input.notes ?? null,
    created_at: now,
  } as SaleRecord;

  const items = input.items.map((it: any) => ({
    id: crypto.randomUUID(),
    sale_id,
    ...it,
    created_at: now,
  })) as SaleItemRecord[];

  const payments = (input.payments ?? []).map((p: any) => ({
    id: crypto.randomUUID(),
    sale_id,
    ...p,
    paid_at: now,
  })) as SalePaymentRecord[];

  return { sale, items, payments };
}

export async function createPosSale(input: CreatePosSaleInput) {
  if (localStorage.getItem("is_demo_mode") === "true") {
    const sale_id = `demo-${Date.now()}`;
    const now = new Date().toISOString();
    const sale = {
      id: sale_id,
      business_id: input.business_id,
      sale_number: `SAL-DEMO-${Math.floor(100 + Math.random() * 900)}`,
      status: 'completed',
      customer_id: input.customer_id,
      cashier_id: input.cashier_id,
      location_id: input.location_id ?? "demo-loc-1",
      subtotal: input.subtotal,
      tax_amount: input.tax_amount,
      vat_rate: input.vat_rate ?? 0,
      price_type: input.price_type ?? "inclusive",
      amount_before_vat: input.amount_before_vat ?? input.subtotal,
      output_vat: input.output_vat ?? input.tax_amount,
      total_amount: input.total_amount,
      discount_amount: input.discount_amount ?? 0,
      discount_type: input.discount_type ?? null,
      payment_method: input.payment_method,
      payment_status: input.payment_status,
      notes: input.notes ?? null,
      created_at: now,
    } as SaleRecord;

    const items = input.items.map((it: any) => ({
      id: crypto.randomUUID(),
      sale_id,
      ...it,
      created_at: now,
    })) as SaleItemRecord[];

    const payments = (input.payments ?? []).map((p: any) => ({
      id: crypto.randomUUID(),
      sale_id,
      ...p,
      paid_at: now,
    })) as SalePaymentRecord[];

    return { sale, items, payments };
  }

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
      vat_rate: input.vat_rate ?? 0,
      price_type: input.price_type ?? "inclusive",
      amount_before_vat: input.amount_before_vat ?? input.subtotal,
      output_vat: input.output_vat ?? input.tax_amount,
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
  if (localStorage.getItem("is_demo_mode") === "true") {
    return {
      id: "demo-register-1",
      user_id: userId,
      business_id: "demo-business-id",
      location_id: locationId || "demo-loc-1",
      closing_date: new Date().toISOString().split('T')[0],
      opened_at: new Date(Date.now() - 3600000).toISOString(),
      opening_cash: 50000,
      cash_amount: 145000,
      momo_amount: 82000,
      bank_amount: 0,
      card_amount: 25000,
      credit_amount: 0,
      total_amount: 252000,
      status: 'open',
      closed_at: null,
    } as any;
  }
  const client = await ensureSupabaseConfigured();

  const { data, error } = await client
    .from('day_closures')
    .select('*')
    .eq('user_id', userId)
    .eq('location_id', locationId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function pushRegisterOpenToSupabase(payload: any) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from('day_closures')
    .insert(payload)
    .select('*')
    .single();

  if (!error) return data;

  if (isDuplicateRegisterOpenError(error)) {
    const existingOpenRegister = await checkOpenRegister(payload.user_id, payload.location_id);
    if (existingOpenRegister) {
      return existingOpenRegister;
    }
  }

  throw error;
}

export async function openRegister(userId: string, businessId: string, locationId: string, startingAmount: number) {
  const now = new Date().toISOString();
  const payload = {
    user_id: userId,
    business_id: businessId,
    location_id: locationId,
    closing_date: new Date().toISOString().split('T')[0],
    opened_at: now,
    opening_cash: startingAmount,
    cash_amount: 0,
    momo_amount: 0,
    bank_amount: 0,
    card_amount: 0,
    credit_amount: 0,
    total_amount: 0,
    status: 'open',
    closed_at: null
  };

  const isOnline = navigator.onLine;
  if (isOnline) {
    try {
      const openedRegister = await pushRegisterOpenToSupabase(payload);
      return openedRegister ?? { ...payload, created_at: now };
    } catch (e) {
      if (isDuplicateRegisterOpenError(e)) {
        const existingOpenRegister = await checkOpenRegister(userId, locationId);
        if (existingOpenRegister) {
          return existingOpenRegister;
        }
      }

      console.warn("Offline register open fallback", e);
    }
  }

  // Track locally only when the server could not confirm the register open.
  await db.pending_actions.add({
    id: crypto.randomUUID(),
    type: 'register_open',
    payload,
    status: 'pending',
    created_at: now
  });

  return { ...payload, created_at: now };
}

export async function getCloseDaySummary(userId: string, locationId: string, openedAt?: string | null): Promise<CloseDaySummary> {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return {
      cash_amount: 145000,
      momo_amount: 82000,
      bank_amount: 0,
      card_amount: 25000,
      credit_amount: 0,
      credit_collected_amount: 0,
      total_amount: 252000
    };
  }
  const client = await ensureSupabaseConfigured();
  const today = new Date().toISOString().split('T')[0];
  const startAt = openedAt ?? `${today}T00:00:00Z`;

  const summary = {
    cash_amount: 0,
    momo_amount: 0,
    bank_amount: 0,
    card_amount: 0,
    credit_amount: 0,
    credit_collected_amount: 0,
    total_amount: 0
  };

  try {
    const { data: sales, error: salesError } = await client
      .from('sales')
      .select('id, total_amount, payment_method, payment_status, sale_payments(payment_method, amount)')
      .eq('cashier_id', userId)
      .eq('location_id', locationId)
      .gte('created_at', startAt);

    if (salesError) throw salesError;

    sales?.forEach((sale: any) => {
      const payments = Array.isArray(sale.sale_payments) ? sale.sale_payments : [];
      const paidAmount = payments.reduce((total: number, payment: any) => total + Number(payment.amount || 0), 0);
      
      if (sale.payment_status === 'unpaid') {
        summary.credit_amount += Number(sale.total_amount || 0);
        return;
      }

      if (sale.payment_status === 'partial') {
        summary.credit_amount += Math.max(0, Number(sale.total_amount) - paidAmount);
      }

      if (payments.length > 0) {
        payments.forEach((p: any) => {
          const amt = Number(p.amount || 0);
          if (p.payment_method === 'cash') summary.cash_amount += amt;
          else if (p.payment_method === 'momo') summary.momo_amount += amt;
          else if (p.payment_method === 'bank') summary.bank_amount += amt;
          else if (p.payment_method === 'card') summary.card_amount += amt;
        });
      } else {
        const amt = Number(sale.total_amount || 0);
        if (sale.payment_method === 'cash') summary.cash_amount += amt;
        else if (sale.payment_method === 'momo') summary.momo_amount += amt;
        else if (sale.payment_method === 'bank') summary.bank_amount += amt;
        else if (sale.payment_method === 'card') summary.card_amount += amt;
      }
    });

    // Credit collections made during this shift (for debts from earlier sales)
    try {
      const { data: paymentsToday } = await client
        .from('sale_payments')
        .select('amount, payment_method, paid_at, sales!inner(id, created_at, location_id)')
        .eq('sales.location_id', locationId)
        .gte('paid_at', startAt);

      (paymentsToday || []).forEach((payment: any) => {
        if (new Date(payment.sales?.created_at || 0).getTime() < new Date(startAt).getTime()) {
          const amt = Number(payment.amount || 0);
          summary.credit_collected_amount += amt;
          if (payment.payment_method === 'cash') summary.cash_amount += amt;
          else if (payment.payment_method === 'momo') summary.momo_amount += amt;
          else if (payment.payment_method === 'bank') summary.bank_amount += amt;
          else if (payment.payment_method === 'card') summary.card_amount += amt;
        }
      });
    } catch {
      // Ignore inner join failure if debt collections query is unsupported
    }
  } catch (err) {
    console.error("Error computing close day summary:", err);
  }

  summary.total_amount = summary.cash_amount + summary.momo_amount + summary.bank_amount + summary.card_amount;
  return summary;
}

export async function pushDayClosureToSupabase(payload: any, shiftId?: string) {
  const client = await ensureSupabaseConfigured();

  // Strip any properties that are not columns in day_closures table
  const { credit_collected_amount, ...cleanPayload } = payload;

  // 1. If we have a specific shift ID, update that exact row
  if (shiftId) {
    const { data: updatedById, error: errorById } = await client
      .from('day_closures')
      .update(cleanPayload)
      .eq('id', shiftId)
      .select('*');

    if (!errorById && updatedById && updatedById.length > 0) {
      return updatedById[0];
    }
  }

  // 2. Otherwise update open register matching user and location
  const { data: updated, error } = await client
    .from('day_closures')
    .update(cleanPayload)
    .eq('user_id', cleanPayload.user_id)
    .eq('location_id', cleanPayload.location_id)
    .eq('status', 'open')
    .select('*');

  if (!error && updated && updated.length > 0) {
    return updated[0];
  }

  // 3. Fallback: update any open register for this user
  const { data: fallbackUpdated, error: fallbackError } = await client
    .from('day_closures')
    .update(cleanPayload)
    .eq('user_id', cleanPayload.user_id)
    .eq('status', 'open')
    .select('*');

  if (!fallbackError && fallbackUpdated && fallbackUpdated.length > 0) {
    return fallbackUpdated[0];
  }

  // 4. Ultimate safeguard: insert a closed record if no open row existed
  const { data: inserted, error: insertError } = await client
    .from('day_closures')
    .insert({ ...cleanPayload, status: 'closed' })
    .select('*')
    .single();

  if (insertError) throw insertError;
  return inserted;
}

export async function createDayClosure(
  userId: string,
  businessId: string,
  locationId: string,
  summary: CloseDaySummary,
  shiftId?: string
) {
  const payload = {
    user_id: userId,
    business_id: businessId,
    location_id: locationId,
    closing_date: new Date().toISOString().split('T')[0],
    cash_amount: Number(summary.cash_amount || 0),
    momo_amount: Number(summary.momo_amount || 0),
    bank_amount: Number(summary.bank_amount || 0),
    card_amount: Number(summary.card_amount || 0),
    credit_amount: Number(summary.credit_amount || 0),
    total_amount: Number(summary.total_amount || 0),
    status: 'closed',
    closed_at: new Date().toISOString()
  };

  const isOnline = navigator.onLine;

  if (isOnline) {
    const closedShift = await pushDayClosureToSupabase(payload, shiftId);
    return closedShift ?? payload;
  }

  // Offline only: queue for sync when connection returns
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
