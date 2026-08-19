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

// Older sale RPCs stored an `out` movement with a positive quantity. Treat the
// movement direction as the source of truth, so historic and new records read
// consistently even before old data is corrected by the migration.
function signedQuantity(movement: any): number {
  const quantity = Math.abs(Number(movement.quantity) || 0);
  if (movement.movement_type === "out") return -quantity;
  if (movement.movement_type === "transfer") {
    return movement.location_id ? -quantity : quantity;
  }
  return movement.movement_type === "count" ? Number(movement.quantity) || 0 : quantity;
}

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
  const client = await ensureSupabaseConfigured();
  const limit = options?.limit ?? 100;
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
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.startDate) {
    query = query.gte("created_at", options.startDate.toISOString());
  }

  if (options?.endDate) {
    query = query.lte("created_at", options.endDate.toISOString());
  }

  if (options?.movementType) {
    query = query.eq("movement_type", options.movementType);
  }

  const { data, error } = await query;

  if (error) throw error;

  const { data: stocks, error: stocksError } = await client
    .from("product_stocks")
    .select("quantity")
    .eq("product_id", productId);
  if (stocksError) throw stocksError;

  // Results are newest first. Rewind from today's quantity to show the stock
  // remaining immediately after every past movement.
  let balance = (stocks || []).reduce((total: number, stock: any) => total + (Number(stock.quantity) || 0), 0);

  return (data || []).map((movement: any) => {
    const quantity = signedQuantity(movement);
    const balanceAfter = balance;
    balance -= quantity;
    return {
    id: movement.id,
    productId: movement.product_id,
    productName: movement.products?.name || "Unknown",
    movementType: movement.movement_type,
    quantity,
    balanceAfter,
    locationName: movement.location?.name,
    destinationLocationName: movement.destination_location?.name,
    userName: movement.user?.full_name || "System",
    referenceType: movement.reference_type,
    referenceNumber: movement.reference_id,
    notes: movement.notes,
    createdAt: new Date(movement.created_at).toLocaleString(),
    occurredAt: movement.created_at,
  };
  });
}

/**
 * Get stock movement summary for a product
 */
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
