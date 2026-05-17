import { ensureSupabaseConfigured } from "./supabaseUtils";

export type ProductMovement = {
  id: string;
  productId: string;
  productName: string;
  movementType: 'in' | 'out' | 'transfer' | 'count';
  quantity: number;
  locationName?: string;
  destinationLocationName?: string;
  userName?: string;
  referenceType?: 'purchase' | 'sale' | 'stock_count' | 'transfer';
  referenceNumber?: string;
  createdAt: string;
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
      location:locations(name),
      destination_location:locations(name),
      user:users(full_name),
      reference_type,
      reference_id,
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

  return (data || []).map((movement: any) => ({
    id: movement.id,
    productId: movement.product_id,
    productName: movement.products?.[0]?.name || "Unknown",
    movementType: movement.movement_type,
    quantity: movement.quantity,
    locationName: movement.location?.name,
    destinationLocationName: movement.destination_location?.name,
    userName: movement.user?.full_name || "System",
    referenceType: movement.reference_type,
    referenceNumber: movement.reference_id,
    createdAt: new Date(movement.created_at).toLocaleString(),
  }));
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
    productName = movement.products?.[0]?.name || productName;
    if (movement.movement_type === "in" || movement.movement_type === "count") {
      totalIncoming += movement.quantity;
    } else if (movement.movement_type === "out") {
      totalOutgoing += movement.quantity;
    }
  });

  const lastMovement = data?.[0];

  return {
    productId,
    productName,
    totalIncoming,
    totalOutgoing,
    netMovement: totalIncoming - totalOutgoing,
    lastMovement: lastMovement ? {
      id: lastMovement.id,
      productId: lastMovement.product_id,
      productName: lastMovement.products?.[0]?.name || "Unknown",
      movementType: lastMovement.movement_type,
      quantity: lastMovement.quantity,
      createdAt: new Date(lastMovement.created_at).toLocaleString(),
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
      location:locations(name),
      destination_location:locations(name),
      user:users(full_name),
      reference_type,
      reference_id,
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
    productName: movement.products?.[0]?.name || "Unknown",
    movementType: movement.movement_type,
    quantity: movement.quantity,
    locationName: movement.location?.name,
    destinationLocationName: movement.destination_location?.name,
    userName: movement.user?.full_name || "System",
    referenceType: movement.reference_type,
    referenceNumber: movement.reference_id,
    createdAt: new Date(movement.created_at).toLocaleString(),
  }));
}
