import type { PaymentMethod, PaymentStatus, SaleItemRecord, SaleRecord } from "../types/database";
import { ensureSupabaseConfigured } from "./supabaseUtils";
import { db } from "../lib/db";

type CreateSaleInput = {
  sale_number: string;
  customer_id: string | null;
  cashier_id: string;
  business_id: string;
  location_id: string | null;
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
  items: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    vat_rate?: number;
    amount_before_vat?: number;
    output_vat?: number;
  }>;
};

export async function pushSaleToSupabase(input: CreateSaleInput) {
  const client = await ensureSupabaseConfigured();

  const { data: sale, error: saleError } = await client
    .from("sales")
    .insert({
      sale_number: input.sale_number,
      business_id: input.business_id,
      customer_id: input.customer_id,
      cashier_id: input.cashier_id,
      subtotal: input.subtotal,
      tax_amount: input.tax_amount,
      vat_rate: input.vat_rate ?? 0,
      price_type: input.price_type ?? "inclusive",
      amount_before_vat: input.amount_before_vat ?? input.subtotal,
      output_vat: input.output_vat ?? input.tax_amount,
      total_amount: input.total_amount,
      payment_method: input.payment_method,
      payment_status: input.payment_status,
      location_id: input.location_id,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();

  if (saleError) throw saleError;

  const { data: items, error: itemsError } = await client
    .from("sale_items")
    .insert(
      input.items.map((item) => ({
        sale_id: sale.id,
        business_id: input.business_id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        vat_rate: item.vat_rate ?? input.vat_rate ?? 0,
        amount_before_vat: item.amount_before_vat ?? item.line_total,
        output_vat: item.output_vat ?? 0,
      })),
    )
    .select("*");

  if (itemsError) throw itemsError;

  return {
    sale: sale as SaleRecord,
    items: (items ?? []) as SaleItemRecord[],
  };
}

export async function createSale(input: CreateSaleInput) {
  const isOnline = navigator.onLine;

  if (isOnline) {
    try {
      return await pushSaleToSupabase(input);
    } catch (err: any) {
      // If it's a network error, handle gracefully as offline fallback
      if (err?.message === 'Failed to fetch' || err?.message?.includes('network')) {
         console.warn("Network error during checkout, falling back to offline mode.", err);
      } else {
         throw err;
      }
    }
  }

  // OFFLINE FALLBACK: Save to IndexedDB
  const pendingId = crypto.randomUUID();
  await db.pending_sales.put({
    id: pendingId,
    type: 'sale',
    payload: input,
    status: 'pending',
    created_at: new Date().toISOString()
  });

  // Mock success response locally
  return {
    sale: {
      id: pendingId,
      sale_number: input.sale_number,
      customer_id: input.customer_id,
      cashier_id: input.cashier_id,
      subtotal: input.subtotal,
      tax_amount: input.tax_amount,
      vat_rate: input.vat_rate ?? 0,
      price_type: input.price_type ?? "inclusive",
      amount_before_vat: input.amount_before_vat ?? input.subtotal,
      output_vat: input.output_vat ?? input.tax_amount,
      total_amount: input.total_amount,
      payment_method: input.payment_method,
      payment_status: input.payment_status,
      location_id: input.location_id,
      notes: input.notes ?? null,
      created_at: new Date().toISOString(),
      business_id: 'pending'
    } as unknown as SaleRecord,
    items: input.items.map(item => ({
      ...item,
      id: crypto.randomUUID(),
      sale_id: pendingId,
      business_id: 'pending'
    })) as unknown as SaleItemRecord[]
  };
}

const DEMO_SALES_RECORDS = [
  {
    id: "demo-sale-1",
    sale_number: "SAL-DEMO-891",
    customer_id: "demo-cust-1",
    subtotal: 12288,
    tax_amount: 2212,
    total_amount: 14500,
    payment_method: "momo",
    payment_status: "paid",
    created_at: new Date(Date.now() - 1800000).toISOString(),
    customers: { full_name: "Jean Paul Ndayisaba" },
    users: { full_name: "Demo Store Admin" },
    locations: { name: "Main Branch - Nyarugenge (Demo)" },
    sale_items: [
      { id: "demo-item-1", quantity: 5, unit_price: 1200, line_total: 6000, products: { name: "Inyange Fresh Milk 1L" } },
      { id: "demo-item-2", quantity: 1, unit_price: 8500, line_total: 8500, products: { name: "Basmati Rice 5kg" } },
    ],
    sale_payments: [{ id: "demo-pay-1", payment_method: "momo", amount: 14500, paid_at: new Date().toISOString() }],
  },
  {
    id: "demo-sale-2",
    sale_number: "SAL-DEMO-890",
    customer_id: null,
    subtotal: 7203,
    tax_amount: 1297,
    total_amount: 8500,
    payment_method: "cash",
    payment_status: "paid",
    created_at: new Date(Date.now() - 3600000).toISOString(),
    customers: null,
    users: { full_name: "Demo Store Admin" },
    locations: { name: "Main Branch - Nyarugenge (Demo)" },
    sale_items: [
      { id: "demo-item-3", quantity: 1, unit_price: 8500, line_total: 8500, products: { name: "Basmati Rice 5kg" } },
    ],
    sale_payments: [{ id: "demo-pay-2", payment_method: "cash", amount: 8500, paid_at: new Date().toISOString() }],
  },
  {
    id: "demo-sale-3",
    sale_number: "SAL-DEMO-889",
    customer_id: "demo-cust-2",
    subtotal: 18644,
    tax_amount: 3356,
    total_amount: 22000,
    payment_method: "card",
    payment_status: "paid",
    created_at: new Date(Date.now() - 7200000).toISOString(),
    customers: { full_name: "Marie Claire Uwase" },
    users: { full_name: "Demo Store Admin" },
    locations: { name: "Kicukiro Branch (Demo)" },
    sale_items: [
      { id: "demo-item-4", quantity: 2, unit_price: 6500, line_total: 13000, products: { name: "Rwandan Coffee Beans 500g" } },
      { id: "demo-item-5", quantity: 1, unit_price: 9000, line_total: 9000, products: { name: "Sunflower Cooking Oil 3L" } },
    ],
    sale_payments: [{ id: "demo-pay-3", payment_method: "card", amount: 22000, paid_at: new Date().toISOString() }],
  },
];

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
  if (localStorage.getItem("is_demo_mode") === "true") {
    return { data: DEMO_SALES_RECORDS, count: DEMO_SALES_RECORDS.length };
  }
  const isOnline = navigator.onLine;

  if (isOnline) {
    try {
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
        query = query.gte("created_at", `${params.date}T00:00:00Z`);
        query = query.lte("created_at", `${params.date}T23:59:59Z`);
      }

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      return {
        data: (data ?? []) as SaleRecord[],
        count: count ?? 0
      };
    } catch (err: any) {
      if (err?.message !== 'Failed to fetch' && !err?.message?.includes('network')) {
        throw err;
      }
    }
  }

  // OFFLINE FALLBACK: Read from IndexedDB Pending Sales
  let pendingSales = await db.pending_sales.orderBy('created_at').reverse().toArray();
  
  // Basic filtering for offline view
  if (params.cashierId && params.cashierId !== 'all') {
     pendingSales = pendingSales.filter(sale => sale.payload.cashier_id === params.cashierId);
  }

  const mappedData = await Promise.all(pendingSales.map(async (sale) => {
    const payload = sale.payload;
    let customerName = "Unknown";
    
    if (payload.customer_id) {
       const cachedCustomers = await db.cached_customers.toArray();
       const cust = cachedCustomers.find(c => c.id === payload.customer_id);
       if (cust) customerName = cust.data.full_name;
    }

    return {
      id: sale.id,
      sale_number: `OFFLINE-${sale.id.split('-')[0].toUpperCase()}`,
      created_at: sale.created_at,
      total_amount: payload.total_amount,
      payment_status: payload.payment_status || 'paid',
      customer: { full_name: customerName },
      cashier: { full_name: "Active Cashier" },
    };
  }));

  const from = (params.page - 1) * params.pageSize;
  return {
    data: mappedData.slice(from, from + params.pageSize),
    count: mappedData.length
  };
}

export async function getSaleDetails(saleId: string) {
  const isOnline = navigator.onLine;

  if (isOnline) {
    try {
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
            discount_amount,
            discount_type,
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

      if (error) throw error;
      return data;
    } catch (err: any) {
      if (err?.message !== 'Failed to fetch' && !err?.message?.includes('network')) {
        throw err;
      }
    }
  }

  // OFFLINE FALLBACK: Fetch from indexedDB
  const pendingSale = await db.pending_sales.get(saleId);
  if (!pendingSale) {
    throw new Error("Sale not found or syncing error offline.");
  }

  const payload = pendingSale.payload as any;

  // Reconstruct customers
  let customerDetails = null;
  if (payload.customer_id) {
    const custs = await db.cached_customers.toArray();
    const c = custs.find(x => x.id === payload.customer_id);
    if (c) customerDetails = c.data;
  }

  // Reconstruct products
  const cachedProds = await db.cached_products.toArray();
  const items = payload.items.map((it: any) => {
     const p = cachedProds.find(cp => cp.id === it.product_id);
     return {
       ...it,
       id: crypto.randomUUID(),
       products: p ? p.data : { name: "Unknown Offline Item" }
     };
  });

  // Reconstruct payments depending on payload format (createPosSaleInput vs createSaleInput)
  let structuredPayments = [];
  if (payload.payments) {
    structuredPayments = payload.payments.map((p: any) => ({
      id: crypto.randomUUID(),
      payment_method: p.payment_method,
      amount: p.amount,
      paid_at: pendingSale.created_at
    }));
  } else if (payload.payment_method) {
    structuredPayments = [{
      id: crypto.randomUUID(),
      payment_method: payload.payment_method,
      amount: payload.total_amount,
      paid_at: pendingSale.created_at
    }];
  }

  return {
    id: saleId,
    sale_number: `OFFLINE-${saleId.split('-')[0].toUpperCase()}`,
    status: 'completed',
    created_at: pendingSale.created_at,
    total_amount: payload.total_amount,
    subtotal: payload.subtotal,
    tax_amount: payload.tax_amount,
    discount_amount: payload.discount_amount || 0,
    discount_type: payload.discount_type || null,
    payment_status: payload.payment_status || 'paid',
    customers: customerDetails,
    users: { full_name: "Offline Cashier" },
    sale_items: items,
    sale_payments: structuredPayments
  };
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
