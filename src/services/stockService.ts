import { ensureSupabaseConfigured } from "./supabaseUtils";

export type StockCountLine = {
  id: string;
  productId: string;
  name: string;
  stockQty: number;
  mode: "Add" | "Subtract";
  reason: string;
  countedQty: number;
};

export type StockCountSummary = {
  id: string;
  countNumber: number;
  stockName: string;
  createdBy: string;
  createdAt: string;
  lines: StockCountLine[];
};

export type StockTransferLine = {
  id: string;
  productId: string;
  name: string;
  availableQty: number;
  sendQty: number;
};

export type StockTransferSummary = {
  id: string;
  transferNumber: number;
  fromStock: string;
  toStock: string;
  status: "Pending" | "In Transit" | "Completed";
  createdAt: string;
  lines: StockTransferLine[];
};

function mapStockStatus(status: string | null): StockTransferSummary["status"] {
  if (status === "completed") return "Completed";
  if (status === "in_transit") return "In Transit";
  return "Pending";
}

export async function listStockCounts(): Promise<StockCountSummary[]> {
  const client = await ensureSupabaseConfigured();
  
  // Try with count_number first
  let { data, error } = await client
    .from("stock_counts")
    .select(`id,count_number,locations!inner(name),created_at,users(full_name),stock_count_items(id,product_id,system_quantity,adjustment_mode,adjustment_reason,counted_quantity,final_quantity,products(name))`)
    .order("created_at", { ascending: false })
    .limit(20);

  // Fallback if column doesn't exist yet
  if (error && (error.code === "42703" || (error as any).status === 400)) {
    const fallback = await client
      .from("stock_counts")
      .select(`id,locations!inner(name),created_at,users(full_name),stock_count_items(id,product_id,system_quantity,adjustment_mode,adjustment_reason,counted_quantity,final_quantity,products(name))`)
      .order("created_at", { ascending: false })
      .limit(20);
    data = fallback.data as any;
    error = fallback.error;
  }

  if (error) throw error;

  return (data || []).map((count: any) => ({
    id: count.id,
    countNumber: count.count_number,
    stockName: count.locations?.name || "Unknown Location",
    createdBy: count.users?.full_name || "Unknown",
    createdAt: new Date(count.created_at).toLocaleString(),
    lines: (count.stock_count_items || []).map((item: any) => ({
      id: item.id,
      productId: item.product_id,
      name: item.products?.name || "Unknown product",
      stockQty: Number(item.system_quantity) || 0,
      mode: item.adjustment_mode === "subtract" ? "Subtract" : "Add",
      reason: item.adjustment_reason || "correction",
      countedQty: Number(item.counted_quantity) || 0,
    })),
  }));
}

export async function listStockTransfers(): Promise<StockTransferSummary[]> {
  const client = await ensureSupabaseConfigured();

  // 1. Fetch the transfers (Try with transfer_number first)
  let { data: transfers, error: transferError } = await client
    .from("stock_transfers")
    .select(`
      id,
      transfer_number,
      status,
      created_at,
      from_location_id,
      to_location_id,
      stock_transfer_items(
        id,
        product_id,
        available_quantity,
        transfer_quantity,
        products(name)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(20);

  // Fallback if column doesn't exist yet
  if (transferError && (transferError.code === "42703" || (transferError as any).status === 400)) {
    const fallback = await client
      .from("stock_transfers")
      .select(`
        id,
        status,
        created_at,
        from_location_id,
        to_location_id,
        stock_transfer_items(
          id,
          product_id,
          available_quantity,
          transfer_quantity,
          products(name)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(20);
    transfers = fallback.data as any;
    transferError = fallback.error;
  }

  if (transferError) throw transferError;

  // 2. Fetch all locations to resolve names manually
  const { data: locations, error: locError } = await client
    .from("locations")
    .select("id, name");

  if (locError) throw locError;

  const locationMap = new Map((locations || []).map(loc => [loc.id, loc.name]));

  // 3. Map the data manually
  return (transfers || []).map((transfer: any) => ({
    id: transfer.id,
    transferNumber: transfer.transfer_number,
    fromStock: locationMap.get(transfer.from_location_id) || "Unknown Location",
    toStock: locationMap.get(transfer.to_location_id) || "Unknown Location",
    status: mapStockStatus(transfer.status),
    createdAt: transfer.created_at ? new Date(transfer.created_at).toLocaleDateString() : "N/A",
    lines: (transfer.stock_transfer_items || []).map((item: any) => ({
      id: item.id,
      productId: item.product_id,
      name: item.products?.name || "Unknown product",
      availableQty: Number(item.available_quantity) || 0,
      sendQty: Number(item.transfer_quantity) || 0,
    })),
  }));
}

export async function recordStockCount(
  locationId: string,
  createdBy: string,
  notes: string,
  items: Array<{ productId: string; systemQuantity: number; countedQuantity: number; mode: string; reason?: string }>
) {
  const client = await ensureSupabaseConfigured();
  const transformedItems = items.map(item => ({
    product_id: item.productId,
    system_quantity: item.systemQuantity,
    counted_quantity: item.countedQuantity,
    adjustment_mode: item.mode.toLowerCase(),
    reason: item.reason || 'correction'
  }));

  const { data, error } = await client.rpc("process_stock_count", {
    p_location_id: locationId,
    p_created_by: createdBy,
    p_notes: notes,
    p_items: transformedItems
  });

  if (error) throw error;
  return data;
}

export async function recordStockTransfer(
  fromLocationId: string,
  toLocationId: string,
  status: "pending" | "in_transit" | "completed",
  createdBy: string,
  items: Array<{ productId: string; availableQuantity: number; transferQuantity: number }>
) {
  const client = await ensureSupabaseConfigured();
  const transformedItems = items.map(item => ({
    product_id: item.productId,
    available_quantity: item.availableQuantity,
    transfer_quantity: item.transferQuantity
  }));

  const { data, error } = await client.rpc("process_stock_transfer", {
    p_from_location_id: fromLocationId,
    p_to_location_id: toLocationId,
    p_status: status,
    p_created_by: createdBy,
    p_items: transformedItems
  });

  if (error) throw error;
  return data;
}

export async function updateStockTransferStatus(
  transferId: string,
  newStatus: "pending" | "in_transit" | "completed",
  userId: string
) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client.rpc("update_stock_transfer_status", {
    p_transfer_id: transferId,
    p_new_status: newStatus,
    p_user_id: userId
  });

  if (error) throw error;
}
