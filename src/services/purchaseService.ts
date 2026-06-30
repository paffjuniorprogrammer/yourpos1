import { ensureSupabaseConfigured } from "./supabaseUtils";
import { db } from "../lib/db";
import type { PaymentMethod } from "../types/database";

const FAST_CACHE_TIMEOUT_MS = 5000;

function withFastCacheTimeout<T>(promise: PromiseLike<T>) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Network timeout, using local cache.")), FAST_CACHE_TIMEOUT_MS),
    ),
  ]);
}

export type PurchaseItemSummary = {
  id: string;
  productId: string;
  product: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  profitPercentage: number;
};

export type PurchaseSummary = {
  id: string;
  purchaseNumber?: number;
  supplier: string;
  location: string;
  amount: string;
  totalCost: number;
  paidAmount: number;
  remainingAmount: number;
  lastPaymentDate: string | null;
  paymentStatus: "Paid" | "Partially Paid" | "Due";
  deliveryStatus: "Pending" | "Received";
  date: string;
  items: PurchaseItemSummary[];
};

export type PurchaseRequisitionItem = {
  id: string;
  product_id: string;
  product_name?: string;
  quantity: number;
  unit_cost: number;
  notes?: string;
};

export type PurchaseRequisition = {
  id: string;
  requisition_number: number;
  location_id: string;
  location_name?: string;
  supplier_id?: string;
  supplier_name?: string;
  status: 'pending' | 'converted' | 'cancelled';
  notes?: string;
  items: PurchaseRequisitionItem[];
  created_at: string;
  created_by: string;
};

function mapPaymentStatus(status: string | null): PurchaseSummary["paymentStatus"] {
  if (status === "paid") return "Paid";
  if (status === "partial") return "Partially Paid";
  return "Due";
}

function mapDeliveryStatus(status: string | null): PurchaseSummary["deliveryStatus"] {
  if (status === "received") return "Received";
  return "Pending";
}

export async function listPurchases(params: {
  page: number;
  pageSize: number;
  search?: string;
  businessId?: string;
}): Promise<{ data: PurchaseSummary[]; count: number }> {
  const cacheKey = `purchases:${params.businessId || 'all'}:${params.page}:${params.pageSize}:${params.search ?? ""}`;
  const isOnline = navigator.onLine;

  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  if (isOnline) {
    try {
      const client = await ensureSupabaseConfigured();

      let query = client
        .from("purchases")
        .select(
          `id,purchase_number,total_cost,payment_status,delivery_status,purchase_date,suppliers(name),locations(name),purchase_payments(amount,paid_at,payment_method),purchase_items(id,product_id,quantity,cost_price,line_total,products(name,selling_price))`,
          { count: "exact" }
        );

      if (params.search) {
        // Find matching supplier IDs
        const { data: sups } = await withFastCacheTimeout(client.from("suppliers").select("id").ilike("name", `%${params.search}%`).limit(50));
        const supplierIds = sups?.map((s: any) => s.id) || [];

        // Find matching product IDs
        const { data: prods } = await withFastCacheTimeout(client.from("products").select("id").ilike("name", `%${params.search}%`).limit(50));
        const productIds = prods?.map((p: any) => p.id) || [];

        // Find matching purchase IDs from purchase_items
        let purchaseIdsFromProducts: string[] = [];
        if (productIds.length > 0) {
          const { data: pItems } = await withFastCacheTimeout(client.from("purchase_items").select("purchase_id").in("product_id", productIds).limit(200));
          purchaseIdsFromProducts = pItems?.map((pi: any) => pi.purchase_id) || [];
        }

        // Build OR conditions
        const orConditions = [];
        orConditions.push(`notes.ilike.%${params.search}%`);
        if (supplierIds.length > 0) {
          orConditions.push(`supplier_id.in.(${supplierIds.join(',')})`);
        }
        if (purchaseIdsFromProducts.length > 0) {
          orConditions.push(`id.in.(${purchaseIdsFromProducts.join(',')})`);
        }
        
        const searchNum = Number(params.search.replace(/[^0-9]/g, ''));
        if (searchNum > 0) {
          orConditions.push(`purchase_number.eq.${searchNum}`);
        }

        query = query.or(orConditions.join(','));
      }

      if (params.businessId) {
        query = query.eq('business_id', params.businessId);
      }

      const { data, error, count } = await withFastCacheTimeout(query
        .order("purchase_date", { ascending: false })
        .range(from, to));

      if (error) {
        throw error;
      }

      const result = { data: mapPurchases(data || []), count: count ?? 0 };
      await db.cached_purchases.put({
        key: cacheKey,
        data: result,
        updated_at: new Date().toISOString(),
      });
      return result;
    } catch (error: any) {
      if (error?.message !== "Failed to fetch" && !error?.message?.includes("network") && !error?.message?.includes("timeout")) {
        throw error;
      }
      console.warn("Network error, falling back to offline purchases cache.", error);
    }
  }

  const cached = await db.cached_purchases.get(cacheKey);
  return (cached?.data ?? { data: [], count: 0 }) as { data: PurchaseSummary[]; count: number };
}

function mapPurchases(data: any[]) {
  return data.map((purchase: any) => {
    const items = (purchase.purchase_items || []).map((item: any) => {
      const product = item.products || {};
      const purchasePrice = Number(item.cost_price) || 0;
      const sellingPrice = Number(product.selling_price ?? purchasePrice);
      const profitPercentage = purchasePrice > 0
        ? Math.round(((sellingPrice - purchasePrice) / purchasePrice) * 100)
        : 0;

      return {
        id: item.id,
        productId: item.product_id,
        product: product.name || "Unknown product",
        quantity: Number(item.quantity) || 0,
        purchasePrice,
        sellingPrice,
        profitPercentage,
      };
    });
    const totalCost = Number(purchase.total_cost || 0);
    const payments = purchase.purchase_payments || [];
    const paidAmount = payments.reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);
    const remainingAmount = Math.max(0, totalCost - paidAmount);
    const lastPaymentDate = payments.length
      ? payments
        .map((payment: any) => payment.paid_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null
      : null;

    return {
      id: purchase.id,
      purchaseNumber: purchase.purchase_number,
      supplier: purchase.suppliers?.name || "Unknown Supplier",
      location: purchase.locations?.name || "Unknown Location",
      amount: new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0 }).format(totalCost),
      totalCost,
      paidAmount,
      remainingAmount,
      lastPaymentDate,
      paymentStatus: paidAmount >= totalCost && totalCost > 0 ? "Paid" : paidAmount > 0 ? "Partially Paid" : mapPaymentStatus(purchase.payment_status),
      deliveryStatus: mapDeliveryStatus(purchase.delivery_status),
      date: new Date(purchase.purchase_date || new Date()).toLocaleDateString(),
      items,
    };
  });
}

export async function updatePurchaseStatus(id: string, field: "payment_status" | "delivery_status", value: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client
    .from("purchases")
    .update({ [field]: value })
    .eq("id", id);
  if (error) throw error;
  await db.cached_purchases.clear();
}

export async function addPurchasePayment(
  purchaseId: string,
  paymentMethod: PaymentMethod,
  amount: number,
  paidAt?: string,
) {
  const client = await ensureSupabaseConfigured();
  const { data: purchase, error: purchaseError } = await client
    .from("purchases")
    .select("id,business_id,total_cost,purchase_payments(amount)")
    .eq("id", purchaseId)
    .single();

  if (purchaseError) throw purchaseError;

  const totalCost = Number((purchase as any).total_cost || 0);
  const existingPaid = ((purchase as any).purchase_payments || []).reduce(
    (sum: number, payment: any) => sum + Number(payment.amount || 0),
    0,
  );
  const remaining = Math.max(0, totalCost - existingPaid);
  const safeAmount = Math.min(Math.max(0, amount), remaining);

  if (safeAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const { error: paymentError } = await client
    .from("purchase_payments")
    .insert({
      business_id: (purchase as any).business_id,
      purchase_id: purchaseId,
      payment_method: paymentMethod,
      amount: safeAmount,
      paid_at: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(),
    });

  if (paymentError) throw paymentError;

  const nextPaid = existingPaid + safeAmount;
  const nextStatus = nextPaid >= totalCost ? "paid" : "partial";
  const { error: statusError } = await client
    .from("purchases")
    .update({ payment_status: nextStatus })
    .eq("id", purchaseId);

  if (statusError) throw statusError;

  await db.cached_purchases.clear();
}

export async function deletePurchase(purchaseId: string) {
  const client = await ensureSupabaseConfigured();
  const { data: purchase, error: purchaseError } = await client
    .from("purchases")
    .select("id,business_id,purchase_date,purchase_items(product_id,products(name))")
    .eq("id", purchaseId)
    .single();

  if (purchaseError) throw purchaseError;

  const productIds = ((purchase as any).purchase_items || [])
    .map((item: any) => item.product_id)
    .filter(Boolean);

  if (productIds.length > 0) {
    const { data: soldItems, error: soldItemsError } = await client
      .from("sale_items")
      .select("id,product_id,sales!inner(id,sale_number,created_at,business_id)")
      .in("product_id", productIds)
      .eq("sales.business_id", (purchase as any).business_id)
      .gte("sales.created_at", (purchase as any).purchase_date)
      .limit(1);

    if (soldItemsError) throw soldItemsError;

    if ((soldItems || []).length > 0) {
      const productName =
        ((purchase as any).purchase_items || []).find((item: any) => item.product_id === (soldItems as any[])[0].product_id)
          ?.products?.name || "one of these products";
      throw new Error(`This purchase cannot be deleted because ${productName} has already been sold after this purchase.`);
    }
  }

  const { error } = await client.rpc("delete_purchase_transaction", {
    p_purchase_id: purchaseId
  });

  if (error) {
    throw error;
  }

  await db.cached_purchases.clear();
}

export async function createPurchase(input: {
  supplier_id: string;
  location_id: string;
  total_cost: number;
  payment_status: "paid" | "unpaid" | "partial";
  paid_amount?: number;
  payment_method?: PaymentMethod;
  paid_at?: string;
  delivery_status?: "pending" | "received";
  purchase_date?: string;
  notes?: string;
  requisition_id?: string;
  items: Array<{
    product_id: string;
    quantity: number;
    cost_price: number;
      selling_price?: number;
      vat_rate?: number;
      amount_before_vat?: number;
      input_vat?: number;
      supplier_vat_registered?: boolean;
  }>;
  vat_rate?: number;
  supplier_vat_registered?: boolean;
  price_type?: "inclusive" | "exclusive";
  amount_before_vat?: number;
  input_vat?: number;
}) {
  const client = await ensureSupabaseConfigured();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get local user id
  const { data: dbUser } = await client
    .from("users")
    .select("id,business_id")
    .eq("auth_user_id", user.id)
    .single();
  
  if (!dbUser) throw new Error("Local user record not found");
  const businessId = (dbUser as any).business_id as string;
  const productIds = input.items.map(item => item.product_id);

  const { data: stockBefore } = await client
    .from("product_stocks")
    .select("product_id,quantity")
    .eq("location_id", input.location_id)
    .in("product_id", productIds);

  const beforeByProduct = new Map(
    (stockBefore || []).map((row: any) => [row.product_id, Number(row.quantity || 0)]),
  );

  const { data, error } = await client.rpc("create_purchase_transaction", {
    p_supplier_id: input.supplier_id,
    p_user_id: dbUser.id,
    p_location_id: input.location_id,
    p_total_cost: input.total_cost,
    p_payment_status: input.payment_status,
    p_items: input.items.map(item => ({
      product_id: item.product_id,
      quantity: item.quantity,
      cost_price: item.cost_price,
      selling_price: (item as any).selling_price
    })),
    p_notes: input.notes
  });

  if (error) throw error;
  const purchaseId = String(data);

  await client.from("purchases").update({
    vat_rate: input.vat_rate ?? 0,
    supplier_vat_registered: input.supplier_vat_registered !== false,
    price_type: input.price_type ?? "inclusive",
    amount_before_vat: input.amount_before_vat ?? input.total_cost,
    input_vat: input.input_vat ?? 0,
  }).eq("id", purchaseId);

  await Promise.all(input.items.map(async (item) => {
    await client
      .from("purchase_items")
      .update({
        vat_rate: item.vat_rate ?? input.vat_rate ?? 0,
        supplier_vat_registered: item.supplier_vat_registered ?? input.supplier_vat_registered ?? true,
        amount_before_vat: item.amount_before_vat ?? item.cost_price * item.quantity,
        input_vat: item.input_vat ?? 0,
      })
      .eq("purchase_id", purchaseId)
      .eq("product_id", item.product_id);
  }));

  await client.from("vat_audit_transactions").insert({
    business_id: businessId,
    source_type: "purchase",
    source_id: purchaseId,
    transaction_date: input.purchase_date ? new Date(input.purchase_date).toISOString() : new Date().toISOString(),
    vat_rate: input.vat_rate ?? 0,
    amount_before_vat: input.amount_before_vat ?? input.total_cost,
    input_vat: input.input_vat ?? 0,
    output_vat: 0,
    total_amount: input.total_cost,
  });

  await ensurePurchaseRowsVisible(purchaseId, businessId);
  await ensurePurchaseStockApplied({
    businessId,
    locationId: input.location_id,
    beforeByProduct,
    items: input.items,
  });

  const purchaseUpdates: Record<string, string> = {};
  if (input.delivery_status) {
    purchaseUpdates.delivery_status = input.delivery_status;
  }
  if (input.purchase_date) {
    purchaseUpdates.purchase_date = new Date(input.purchase_date).toISOString();
  }

  if (Object.keys(purchaseUpdates).length > 0) {
    const { error: updateError } = await client
      .from("purchases")
      .update(purchaseUpdates)
      .eq("id", purchaseId);

    if (updateError) throw updateError;
  }

  const initialPaidAmount =
    input.payment_status === "paid"
      ? input.total_cost
      : input.payment_status === "partial"
        ? Number(input.paid_amount || 0)
        : 0;

  if (initialPaidAmount > 0) {
    await addPurchasePayment(
      purchaseId,
      input.payment_method ?? "cash",
      initialPaidAmount,
      input.paid_at,
    );
  }

  if (input.requisition_id) {
    await markPurchaseRequisitionConverted(input.requisition_id);
  }

  // Clear both purchase and product caches so UI reflects updated stock immediately
  await db.cached_purchases.clear();
  await db.cached_products.clear();
  return data;
}

async function ensurePurchaseRowsVisible(purchaseId: string, businessId: string) {
  const client = await ensureSupabaseConfigured();

  const [itemsResult, paymentsResult] = await Promise.allSettled([
    client
      .from("purchase_items")
      .update({ business_id: businessId })
      .eq("purchase_id", purchaseId),
    client
      .from("purchase_payments")
      .update({ business_id: businessId })
      .eq("purchase_id", purchaseId),
  ]);

  itemsResult.status === "rejected" && console.warn("Could not backfill purchase item business_id", itemsResult.reason);
  paymentsResult.status === "rejected" && console.warn("Could not backfill purchase payment business_id", paymentsResult.reason);
  if (itemsResult.status === "fulfilled" && itemsResult.value.error) {
    console.warn("Could not backfill purchase item business_id", itemsResult.value.error);
  }
  if (paymentsResult.status === "fulfilled" && paymentsResult.value.error) {
    console.warn("Could not backfill purchase payment business_id", paymentsResult.value.error);
  }
}

async function ensurePurchaseStockApplied(input: {
  businessId: string;
  locationId: string;
  beforeByProduct: Map<string, number>;
  items: Array<{
    product_id: string;
    quantity: number;
    cost_price: number;
    selling_price?: number;
  }>;
}) {
  const client = await ensureSupabaseConfigured();
  const productIds = input.items.map(item => item.product_id);

  const { data: stockAfter, error: stockAfterError } = await client
    .from("product_stocks")
    .select("product_id,quantity")
    .eq("location_id", input.locationId)
    .in("product_id", productIds);

  if (stockAfterError) {
    console.warn("Could not verify purchase stock after save", stockAfterError);
    return;
  }

  const afterByProduct = new Map(
    (stockAfter || []).map((row: any) => [row.product_id, Number(row.quantity || 0)]),
  );

  const corrections = input.items
    .map(item => {
      const before = input.beforeByProduct.get(item.product_id) || 0;
      const expected = before + Number(item.quantity || 0);
      const actual = afterByProduct.get(item.product_id);
      return { item, expected, actual };
    })
    .filter(({ actual, expected }) => actual === undefined || actual < expected);

  if (corrections.length > 0) {
    await Promise.all(corrections.map(async ({ item, expected, actual }) => {
      if (actual === undefined) {
        const { error } = await client.from("product_stocks").insert({
          business_id: input.businessId,
          product_id: item.product_id,
          location_id: input.locationId,
          quantity: expected,
        });
        if (error) throw error;
      } else {
        const { error } = await client
          .from("product_stocks")
          .update({ business_id: input.businessId, quantity: expected })
          .eq("product_id", item.product_id)
          .eq("location_id", input.locationId);
        if (error) throw error;
      }
    }));
  }

  const { data: allStocks, error: allStocksError } = await client
    .from("product_stocks")
    .select("product_id,quantity")
    .eq("business_id", input.businessId)
    .in("product_id", productIds);

  if (allStocksError) {
    console.warn("Could not calculate product stock totals", allStocksError);
    return;
  }

  const totals = new Map<string, number>();
  (allStocks || []).forEach((row: any) => {
    totals.set(row.product_id, (totals.get(row.product_id) || 0) + Number(row.quantity || 0));
  });

  await Promise.all(input.items.map(async item => {
    const update: Record<string, number> = {
      stock_quantity: totals.get(item.product_id) || 0,
      cost_price: Number(item.cost_price || 0),
    };

    if (Number(item.selling_price || 0) > 0) {
      update.selling_price = Number(item.selling_price);
    }

    const { error } = await client
      .from("products")
      .update(update)
      .eq("id", item.product_id)
      .eq("business_id", input.businessId);

    if (error) throw error;
  }));
}

export async function markPurchaseRequisitionConverted(requisitionId: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client
    .from('purchase_requisitions')
    .update({ status: 'converted' })
    .eq('id', requisitionId);
  if (error) throw error;
}

export async function updatePurchase(
  id: string,
  input: {
    supplier_id: string;
    total_cost: number;
    payment_status: "paid" | "unpaid" | "partial";
    notes?: string;
  },
) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("purchases")
    .update({
      supplier_id: input.supplier_id,
      total_cost: input.total_cost,
      payment_status: input.payment_status,
      notes: input.notes,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  await db.cached_purchases.clear();
  return data;
}

export async function listPurchaseRequisitions(
  status: 'pending' | 'converted' | 'cancelled' | 'all' = 'all',
  businessId?: string,
): Promise<PurchaseRequisition[]> {
  const client = await ensureSupabaseConfigured();
  let query = client
    .from('purchase_requisitions')
    .select(`
      *,
      locations(name),
      suppliers(name),
      purchase_requisition_items(
        *,
        products(name)
      )
    `)
    .order('created_at', { ascending: false });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  if (businessId) {
    query = query.eq('business_id', businessId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(req => ({
    ...req,
    location_name: req.locations?.name,
    supplier_name: req.suppliers?.name,
    items: (req.purchase_requisition_items || []).map((item: any) => ({
      ...item,
      product_name: item.products?.name,
    })),
  }));
}

export async function createPurchaseRequisition(input: {
  location_id: string;
  supplier_id?: string;
  notes?: string;
  items: Omit<PurchaseRequisitionItem, 'id'>[];
}) {
  const client = await ensureSupabaseConfigured();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: dbUser } = await client
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  
  if (!dbUser) throw new Error("Local user record not found");

  const { data, error } = await client.rpc('create_purchase_requisition', {
    p_location_id: input.location_id,
    p_supplier_id: input.supplier_id,
    p_notes: input.notes,
    p_created_by: dbUser.id,
    p_items: input.items
  });

  if (error) throw error;
  return data;
}

export async function updatePurchaseRequisition(id: string, input: {
  location_id: string;
  supplier_id?: string;
  notes?: string;
  items: Omit<PurchaseRequisitionItem, 'id'>[];
}) {
  const client = await ensureSupabaseConfigured();
  
  // Start a transaction-like process
  const { error: deleteError } = await client
    .from('purchase_requisition_items')
    .delete()
    .eq('requisition_id', id);

  if (deleteError) throw deleteError;

  const { error: updateError } = await client
    .from('purchase_requisitions')
    .update({
      location_id: input.location_id,
      supplier_id: input.supplier_id,
      notes: input.notes
    })
    .eq('id', id);

  if (updateError) throw updateError;

  const { error: insertError } = await client
    .from('purchase_requisition_items')
    .insert(input.items.map(item => ({ ...item, requisition_id: id })));

  if (insertError) throw insertError;
}

export async function deletePurchaseRequisition(id: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client
    .from('purchase_requisitions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function getPurchaseRequisitionByNumber(num: number): Promise<PurchaseRequisition | null> {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from('purchase_requisitions')
    .select(`
      *,
      locations(name),
      suppliers(name),
      purchase_requisition_items(
        *,
        products(name)
      )
    `)
    .eq('requisition_number', num)
    .single();

  if (error) return null;

  return {
    ...data,
    location_name: data.locations?.name,
    supplier_name: data.suppliers?.name,
    items: (data.purchase_requisition_items || []).map((item: any) => ({
      ...item,
      product_name: item.products?.name
    }))
  };
}
