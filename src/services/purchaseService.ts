import { ensureSupabaseConfigured } from "./supabaseUtils";
import { db } from "../lib/db";
import type { PaymentMethod } from "../types/database";

const FAST_CACHE_TIMEOUT_MS = 500;

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
}): Promise<{ data: PurchaseSummary[]; count: number }> {
  const cacheKey = `purchases:${params.page}:${params.pageSize}:${params.search ?? ""}`;
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
    .select("id,total_cost,purchase_payments(amount)")
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
  notes?: string;
  items: Array<{
    product_id: string;
    quantity: number;
    cost_price: number;
  }>;
}) {
  const client = await ensureSupabaseConfigured();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get local user id
  const { data: dbUser } = await client
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  
  if (!dbUser) throw new Error("Local user record not found");

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

  await db.cached_purchases.clear();
  return data;
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
