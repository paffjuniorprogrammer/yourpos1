import type { PaymentMethod, PaymentStatus, SaleItemRecord, SaleRecord } from "../types/database";
import { ensureSupabaseConfigured } from "./supabaseUtils";

type CreateSaleInput = {
  sale_number: string;
  customer_id: string | null;
  cashier_id: string;
  location_id: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  notes?: string;
  items: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

export async function createSale(input: CreateSaleInput) {
  const client = await ensureSupabaseConfigured();

  const { data: sale, error: saleError } = await client
    .from("sales")
    .insert({
      sale_number: input.sale_number,
      customer_id: input.customer_id,
      cashier_id: input.cashier_id,
      subtotal: input.subtotal,
      tax_amount: input.tax_amount,
      total_amount: input.total_amount,
      payment_method: input.payment_method,
      payment_status: input.payment_status,
      location_id: input.location_id,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (saleError) {
    throw saleError;
  }

  const { data: items, error: itemsError } = await client
    .from("sale_items")
    .insert(
      input.items.map((item) => ({
        sale_id: sale.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
      })),
    )
    .select();

  if (itemsError) {
    throw itemsError;
  }

  return {
    sale: sale as SaleRecord,
    items: (items ?? []) as SaleItemRecord[],
  };
}

export async function listSales(params: {
  page: number;
  pageSize: number;
  saleNumber?: string;
  customerId?: string;
  cashierId?: string;
  date?: string;
  minDate?: string;
  maxDate?: string;
}): Promise<{ data: any[]; count: number }> {
  const client = await ensureSupabaseConfigured();
  
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  let query = client
    .from("sales")
    .select(`
      *,
      customer:customer_id(full_name),
      cashier:cashier_id(full_name),
      sale_returns(id, status)
    `, { count: "exact" });

  // Server-side filtering
  if (params.saleNumber) {
    query = query.ilike("sale_number", `%${params.saleNumber}%`);
  }
  if (params.customerId && params.customerId !== "all") {
    query = query.eq("customer_id", params.customerId);
  }
  if (params.cashierId && params.cashierId !== "all") {
    query = query.eq("cashier_id", params.cashierId);
  }
  
  if (params.minDate) {
    query = query.gte("created_at", params.minDate);
  }
  if (params.maxDate) {
    query = query.lte("created_at", params.maxDate);
  } else if (params.date && params.date.trim() !== "") {
    // Only match the date part of created_at
    query = query.gte("created_at", `${params.date}T00:00:00Z`);
    query = query.lte("created_at", `${params.date}T23:59:59Z`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  return {
    data: (data ?? []) as SaleRecord[],
    count: count ?? 0
  };
}

export async function getSaleDetails(saleId: string) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("sales")
    .select(`
      *,
      customers:customer_id(id, full_name, phone),
      users:cashier_id(id, full_name),
      sale_items(
        id,
        quantity,
        unit_price,
        line_total,
        products:product_id(id, name)
      ),
      sale_payments(
        id,
        payment_method,
        amount,
        paid_at
      )
    `)
    .eq("id", saleId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteSale(saleId: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client.rpc("delete_sale_transaction", { p_sale_id: saleId });

  if (error) {
    throw error;
  }
}

export async function addSalePayment(saleId: string, paymentMethod: PaymentMethod, amount: number, notes?: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client.rpc("record_sale_payment", {
    p_sale_id: saleId,
    p_payment_method: paymentMethod,
    p_amount: amount,
    p_notes: notes ?? null
  });

  if (error) {
    throw error;
  }
}

export async function updateSaleTransaction(input: {
  sale_id: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  items: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
  notes?: string;
}) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client.rpc("update_sale_transaction", {
    p_sale_id: input.sale_id,
    p_subtotal: input.subtotal,
    p_tax_amount: input.tax_amount,
    p_total_amount: input.total_amount,
    p_items: input.items,
    p_notes: input.notes ?? null
  });

  if (error) {
    throw error;
  }
}
