import { ensureSupabaseConfigured } from "./supabaseUtils";

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
  const client = await ensureSupabaseConfigured();

  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  let query = client
    .from("purchases")
    .select(
      `id,purchase_number,total_cost,payment_status,delivery_status,purchase_date,suppliers(name),locations(name),purchase_items(id,product_id,quantity,cost_price,line_total,products(name,selling_price))`,
      { count: "exact" }
    );

  if (params.search) {
    // Find matching supplier IDs
    const { data: sups } = await client.from("suppliers").select("id").ilike("name", `%${params.search}%`).limit(50);
    const supplierIds = sups?.map((s: any) => s.id) || [];

    // Find matching product IDs
    const { data: prods } = await client.from("products").select("id").ilike("name", `%${params.search}%`).limit(50);
    const productIds = prods?.map((p: any) => p.id) || [];

    // Find matching purchase IDs from purchase_items
    let purchaseIdsFromProducts: string[] = [];
    if (productIds.length > 0) {
      const { data: pItems } = await client.from("purchase_items").select("purchase_id").in("product_id", productIds).limit(200);
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

  const { data, error, count } = await query
    .order("purchase_date", { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  const purchases = (data || []).map((purchase: any) => {
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

    return {
      id: purchase.id,
      purchaseNumber: purchase.purchase_number,
      supplier: purchase.suppliers?.name || "Unknown Supplier",
      location: purchase.locations?.name || "Unknown Location",
      amount: new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0 }).format(Number(purchase.total_cost || 0)),
      paymentStatus: mapPaymentStatus(purchase.payment_status),
      deliveryStatus: mapDeliveryStatus(purchase.delivery_status),
      date: new Date(purchase.purchase_date || new Date()).toLocaleDateString(),
      items,
    };
  });

  return { data: purchases, count: count ?? 0 };
}

export async function updatePurchaseStatus(id: string, field: "payment_status" | "delivery_status", value: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client
    .from("purchases")
    .update({ [field]: value })
    .eq("id", id);
  if (error) throw error;
}

export async function deletePurchase(purchaseId: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client.rpc("delete_purchase_transaction", {
    p_purchase_id: purchaseId
  });

  if (error) {
    throw error;
  }
}

export async function createPurchase(input: {
  supplier_id: string;
  location_id: string;
  total_cost: number;
  payment_status: "paid" | "unpaid" | "partial";
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
    .select()
    .single();

  if (error) throw error;
  return data;
}
