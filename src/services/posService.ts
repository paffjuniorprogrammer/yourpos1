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

type CreatePosSaleInput = {
  customer_id: string | null;
  cashier_id: string;
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

export async function listPosProducts(locationId?: string | null, limit = 500) {
  const client = await ensureSupabaseConfigured();
  
  // Use a lean select to speed up transfer, conditionally including product_stocks
  const selectQuery = locationId ? `
    id, 
    name, 
    barcode, 
    selling_price, 
    stock_quantity, 
    reorder_level, 
    image_url,
    bulk_quantity,
    bulk_price,
    product_stocks(quantity, location_id)
  ` : `
    id, 
    name, 
    barcode, 
    selling_price, 
    stock_quantity, 
    reorder_level, 
    image_url,
    bulk_quantity,
    bulk_price
  `;

  const query = client
    .from("products")
    .select(selectQuery)
    .order("name", { ascending: true })
    .limit(limit);

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []).map((product: any) => {
    let displayStock = product.stock_quantity;
    
    if (locationId && product.product_stocks && Array.isArray(product.product_stocks)) {
      const branchStock = product.product_stocks.find((s: any) => s.location_id === locationId) as { quantity: number } | undefined;
      displayStock = branchStock ? branchStock.quantity : 0;
    }

    return {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      selling_price: Number(product.selling_price),
      stock_quantity: displayStock,
      reorder_level: product.reorder_level || 5,
      image_url: product.image_url,
      category_name: product.category_name ?? null,
      bulk_quantity: product.bulk_quantity ? Number(product.bulk_quantity) : null,
      bulk_price: product.bulk_price ? Number(product.bulk_price) : null,
    };
  }) as PosProductRecord[];
}


export async function listPosCustomers() {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("customers")
    .select("id, full_name, phone")
    .order("full_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as PosCustomerRecord[];
}

export async function getShopSettings() {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("shop_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ShopSettingsRecord | null;
}

export async function createPosSale(input: CreatePosSaleInput) {
  const client = await ensureSupabaseConfigured();

  const { data: saleId, error } = await client.rpc("create_sale_transaction", {
    p_sale_number: null, // Let database generate it atomically inside the transaction
    p_customer_id: input.customer_id,
    p_cashier_id: input.cashier_id,
    p_subtotal: input.subtotal,
    p_tax_amount: input.tax_amount,
    p_total_amount: input.total_amount,
    p_payment_method: input.payment_method,
    p_payment_status: input.payment_status,
    p_notes: input.notes ?? null,
    p_location_id: input.location_id || null,
    p_items: input.items,
    p_payments: input.payments,
    p_discount_amount: input.discount_amount || 0,
    p_discount_type: input.discount_type || null
  });

  if (error) {
    throw error;
  }

  const sale_id = String(saleId);
  const [{ data: sale, error: saleError }, { data: items, error: itemsError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      client.from("sales").select("*").eq("id", sale_id).single(),
      client.from("sale_items").select("*").eq("sale_id", sale_id).order("id", { ascending: true }),
      client.from("sale_payments").select("*").eq("sale_id", sale_id).order("paid_at", { ascending: true }),
    ]);

  if (saleError) {
    throw saleError;
  }
  if (itemsError) {
    throw itemsError;
  }
  if (paymentsError) {
    throw paymentsError;
  }

  return {
    sale: sale as SaleRecord,
    items: (items ?? []) as SaleItemRecord[],
    payments: (payments ?? []) as SalePaymentRecord[],
  };
}

export async function getCloseDaySummary(userId: string, locationId: string, openedAt: string) {
  const client = await ensureSupabaseConfigured();

  // 1. Fetch all payments
  const { data: paymentsData, error: paymentsError } = await client
    .from("sale_payments")
    .select("amount, payment_method, sales!inner(cashier_id, location_id, created_at)")
    .eq("sales.cashier_id", userId)
    .eq("sales.location_id", locationId)
    .gte("sales.created_at", openedAt);

  if (paymentsError) throw paymentsError;

  // 2. Fetch approved returns for this shift to subtract from totals
  const { data: returnsData, error: returnsError } = await client
    .from("sale_returns")
    .select("refund_amount, refund_method")
    .eq("created_by", userId)
    .eq("status", "completed") // Only subtract if approved/completed
    .gte("created_at", openedAt);

  if (returnsError) {
    console.warn("Could not fetch returns for summary calculation:", returnsError);
  }

  const summary = (paymentsData ?? []).reduce<CloseDaySummary>(
    (acc, payment) => {
      const amount = Number(payment.amount ?? 0);
      const method = payment.payment_method as PaymentMethod;

      if (method === "cash") acc.cash_amount += amount;
      if (method === "momo") acc.momo_amount += amount;
      if (method === "bank") acc.bank_amount += amount;
      if (method === "card") acc.card_amount += amount;
      if (method === "credit") acc.credit_amount += amount;
      acc.total_amount += amount;
      return acc;
    },
    {
      cash_amount: 0,
      momo_amount: 0,
      bank_amount: 0,
      card_amount: 0,
      credit_amount: 0,
      total_amount: 0,
    },
  );

  // Subtract approved returns from totals
  (returnsData || []).forEach(ret => {
    const amount = Number(ret.refund_amount || 0);
    const method = ret.refund_method as PaymentMethod;
    if (method === "cash") summary.cash_amount -= amount;
    if (method === "momo") summary.momo_amount -= amount;
    if (method === "bank") summary.bank_amount -= amount;
    if (method === "card") summary.card_amount -= amount;
    if (method === "credit") summary.credit_amount -= amount;
    summary.total_amount -= amount;
  });

  return summary;
}

export async function checkOpenRegister(userId: string, locationId: string) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("cash_registers")
    .select("*")
    .eq("user_id", userId)
    .eq("location_id", locationId)
    .eq("status", "open")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function openRegister(userId: string, locationId: string, openingAmount: number) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("cash_registers")
    .insert({
      user_id: userId,
      location_id: locationId,
      opening_amount: openingAmount,
      status: "open"
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createDayClosure(input: {
  user_id: string;
  location_id: string;
  closing_date: string;
  cash_amount: number;
  momo_amount: number;
  bank_amount: number;
  card_amount: number;
  credit_amount: number;
  total_amount: number;
}) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("day_closures")
    .insert(input)
    .select()
    .single();

  if (error) {
    throw error;
  }

  await client
    .from("cash_registers")
    .update({ 
      status: "closed", 
      closed_at: new Date().toISOString(),
      closing_amount: input.cash_amount,
      total_sales: input.total_amount   // Added for accurate reporting
    })
    .eq("user_id", input.user_id)
    .eq("location_id", input.location_id)
    .eq("status", "open");

  return data as DayClosureRecord;
}
