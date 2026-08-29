import { ensureSupabaseConfigured } from "./supabaseUtils";

export type ProductMovement = {
  id: string;
  productId: string;
  productName: string;
  movementType: 'in' | 'out' | 'transfer' | 'count';
  quantity: number;
  balanceAfter?: number;
  locationName?: string;
  destinationLocationName?: string;
  userName?: string;
  referenceType?: 'purchase' | 'sale' | 'stock_count' | 'transfer' | 'import';
  referenceNumber?: string;
  createdAt: string;
  occurredAt: string;
  notes?: string;
};

export type ProductHistoryStats = {
  productId: string;
  productName: string;
  totalIncoming: number;
  totalOutgoing: number;
  netMovement: number;
  lastMovement?: ProductMovement;
  movementCount: number;
};

function signedQuantity(movement: any): number {
  const rawQty = Number(movement.quantity) || 0;
  const absQty = Math.abs(rawQty);
  const mType = String(movement.movement_type || "").toLowerCase();

  if (
    mType === "out" ||
    mType === "sale" ||
    mType === "expired" ||
    mType === "damage" ||
    mType === "damaged" ||
    mType === "expense" ||
    mType === "wastage" ||
    mType === "loss" ||
    mType === "write-off" ||
    mType === "write_off"
  ) {
    return -absQty;
  }

  if (mType === "in" || mType === "purchase" || mType === "return") {
    return absQty;
  }

  if (mType === "transfer") {
    if (rawQty < 0) return rawQty;
    return movement.location_id && !movement.destination_location_id ? -absQty : absQty;
  }

  if (rawQty < 0) {
    return rawQty;
  }

  return rawQty;
}

const DEMO_PRODUCT_MOVEMENTS: Record<string, ProductMovement[]> = {
  default: [
    {
      id: "demo-mov-1",
      productId: "demo-prod-1",
      productName: "Inyange Fresh Milk 1L",
      movementType: "out",
      quantity: -4,
      balanceAfter: 46,
      locationName: "Main Branch - Nyarugenge (Demo)",
      userName: "Demo Store Admin",
      referenceType: "stock_count",
      referenceNumber: "Write-off #101",
      notes: "Expired past sell-by date",
      createdAt: new Date(Date.now() - 3600000).toLocaleString(),
      occurredAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "demo-mov-2",
      productId: "demo-prod-1",
      productName: "Inyange Fresh Milk 1L",
      movementType: "out",
      quantity: -2,
      balanceAfter: 50,
      locationName: "Main Branch - Nyarugenge (Demo)",
      userName: "Demo Cashier",
      referenceType: "sale",
      referenceNumber: "INV-10024",
      notes: "Retail Sale",
      createdAt: new Date(Date.now() - 7200000).toLocaleString(),
      occurredAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: "demo-mov-3",
      productId: "demo-prod-1",
      productName: "Inyange Fresh Milk 1L",
      movementType: "in",
      quantity: 50,
      balanceAfter: 52,
      locationName: "Main Branch - Nyarugenge (Demo)",
      userName: "Demo Store Admin",
      referenceType: "purchase",
      referenceNumber: "PO-8801",
      notes: "Supplier delivery from Inyange",
      createdAt: new Date(Date.now() - 86400000).toLocaleString(),
      occurredAt: new Date(Date.now() - 86400000).toISOString(),
    }
  ]
};

/**
 * Get the history of all movements for a product
 */
export async function getProductHistory(
  productId: string,
  options?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    movementType?: 'in' | 'out' | 'transfer' | 'count';
  }
): Promise<ProductMovement[]> {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_PRODUCT_MOVEMENTS[productId] || DEMO_PRODUCT_MOVEMENTS.default;
  }
  const client = await ensureSupabaseConfigured();
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;

  // Query stock movements
  let data: any[] | null = null;
  let error: any = null;

  try {
    const res = await client
      .from("stock_movements")
      .select(`
        id,
        product_id,
        products(name),
        movement_type,
        quantity,
        location_id,
        locations(name),
        users(full_name),
        reference_type,
        reference_id,
        notes,
        created_at
      `)
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    data = res.data;
    error = res.error;
  } catch (e) {
    error = e;
  }

  if (error) {
    // Basic fallback without joins
    const fallback = await client
      .from("stock_movements")
      .select("*")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    data = fallback.data;
    if (fallback.error) throw fallback.error;
  }

  const { data: stocks } = await client
    .from("product_stocks")
    .select("quantity")
    .eq("product_id", productId);

  // Results are newest first. Rewind from today's quantity to show the stock
  // remaining immediately after every past movement.
  let balance = (stocks || []).reduce((total: number, stock: any) => total + (Number(stock.quantity) || 0), 0);

  return (data || []).map((movement: any) => {
    const quantity = signedQuantity(movement);
    const balanceAfter = balance;
    balance -= quantity;

    const prod = Array.isArray(movement.products) ? movement.products[0] : movement.products;
    const loc = Array.isArray(movement.locations) ? movement.locations[0] : movement.locations;
    const usr = Array.isArray(movement.users) ? movement.users[0] : movement.users;

    return {
      id: movement.id,
      productId: movement.product_id,
      productName: prod?.name || "Unknown Product",
      movementType: movement.movement_type,
      quantity,
      balanceAfter,
      locationName: loc?.name || movement.location?.name || "Main Location",
      destinationLocationName: movement.destination_location?.name,
      userName: usr?.full_name || movement.user?.full_name || "System",
      referenceType: movement.reference_type,
      referenceNumber: movement.reference_id,
      notes: movement.notes,
      createdAt: movement.created_at ? new Date(movement.created_at).toLocaleString() : "N/A",
      occurredAt: movement.created_at || new Date().toISOString(),
    };
  });
}

export async function getProductHistoryStats(
  productId: string,
  options?: {
    days?: number;
  }
): Promise<ProductHistoryStats> {
  const client = await ensureSupabaseConfigured();
  const days = options?.days ?? 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await client
    .from("stock_movements")
    .select(`
      id,
      product_id,
      products(name),
      movement_type,
      quantity,
      created_at
    `)
    .eq("product_id", productId)
    .gte("created_at", startDate.toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;

  let totalIncoming = 0;
  let totalOutgoing = 0;
  let productName = "Unknown";

  (data || []).forEach((movement: any) => {
    productName = movement.products?.name || productName;
    const quantity = signedQuantity(movement);
    if (quantity >= 0) totalIncoming += quantity;
    else totalOutgoing += Math.abs(quantity);
  });

  const lastMovement: any = data?.[0];

  return {
    productId,
    productName,
    totalIncoming,
    totalOutgoing,
    netMovement: totalIncoming - totalOutgoing,
    lastMovement: lastMovement ? {
      id: lastMovement.id,
      productId: lastMovement.product_id,
      productName: Array.isArray(lastMovement.products) ? lastMovement.products[0]?.name || "Unknown" : lastMovement.products?.name || "Unknown",
      movementType: lastMovement.movement_type,
      quantity: signedQuantity(lastMovement),
      createdAt: new Date(lastMovement.created_at).toLocaleString(),
      occurredAt: lastMovement.created_at,
    } : undefined,
    movementCount: data?.length || 0,
  };
}

/**
 * Get all movements across all locations for a product
 */
export async function getAllProductMovements(
  options?: {
    limit?: number;
    offset?: number;
    locationId?: string;
  }
): Promise<ProductMovement[]> {
  const client = await ensureSupabaseConfigured();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = client
    .from("stock_movements")
    .select(`
      id,
      product_id,
      products(name),
      movement_type,
      quantity,
      location_id,
      location:locations!stock_movements_location_id_fkey(name),
      destination_location:locations!stock_movements_destination_location_id_fkey(name),
      user:users(full_name),
      reference_type,
      reference_id,
      notes,
      created_at
    `)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.locationId) {
    query = query.eq("location_id", options.locationId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map((movement: any) => ({
    id: movement.id,
    productId: movement.product_id,
    productName: movement.products?.name || "Unknown",
    movementType: movement.movement_type,
    quantity: signedQuantity(movement),
    locationName: movement.location?.name,
    destinationLocationName: movement.destination_location?.name,
    userName: movement.user?.full_name || "System",
    referenceType: movement.reference_type,
    referenceNumber: movement.reference_id,
    notes: movement.notes,
    createdAt: new Date(movement.created_at).toLocaleString(),
    occurredAt: movement.created_at,
  }));
}
