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
  fromLocationId: string;
  toLocationId: string;
  fromStock: string;
  toStock: string;
  status: "Pending" | "In Transit" | "Completed";
  createdAt: string;
  createdBy: string;
  createdById: string;
  lines: StockTransferLine[];
};

function mapStockStatus(status: string | null): StockTransferSummary["status"] {
  if (status === "completed") return "Completed";
  if (status === "in_transit") return "In Transit";
  return "Pending";
}

const DEMO_STOCK_COUNTS: StockCountSummary[] = [
  {
    id: "demo-count-1",
    countNumber: 101,
    stockName: "Main Branch - Nyarugenge (Demo)",
    createdBy: "Demo Store Admin",
    createdAt: new Date(Date.now() - 86400000).toLocaleString(),
    lines: [
      { id: "demo-cl-1", productId: "demo-prod-1", name: "Inyange Fresh Milk 1L", stockQty: 50, mode: "Subtract", reason: "damage", countedQty: 5 },
      { id: "demo-cl-2", productId: "demo-prod-6", name: "White Sugar 1kg", stockQty: 60, mode: "Add", reason: "recount", countedQty: 2 },
    ]
  }
];

const DEMO_TRANSFERS: StockTransferSummary[] = [
  {
    id: "demo-trans-1",
    transferNumber: 201,
    fromLocationId: "demo-loc-1",
    toLocationId: "demo-loc-2",
    fromStock: "Main Branch - Nyarugenge (Demo)",
    toStock: "Kicukiro Branch (Demo)",
    status: "Completed",
    createdAt: new Date(Date.now() - 43200000).toLocaleDateString(),
    createdBy: "Demo Store Admin",
    createdById: "demo-user-id",
    lines: [
      { id: "demo-tl-1", productId: "demo-prod-3", name: "Rwandan Coffee Beans 500g", availableQty: 25, sendQty: 7 },
      { id: "demo-tl-2", productId: "demo-prod-5", name: "Sunflower Cooking Oil 3L", availableQty: 20, sendQty: 8 },
    ]
  }
];

export async function listStockCounts(): Promise<StockCountSummary[]> {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_STOCK_COUNTS;
  }
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

export async function listStockTransfers(locationIds: string[] = []): Promise<StockTransferSummary[]> {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_TRANSFERS;
  }
  const client = await ensureSupabaseConfigured();

  // 1. Fetch the transfers (Try with transfer_number first)
  let transferQuery = client
    .from("stock_transfers")
    .select(`
      id,
      transfer_number,
      status,
      created_at,
      created_by,
      from_location_id,
      to_location_id,
      users(full_name),
      stock_transfer_items(
        id,
        product_id,
        available_quantity,
        transfer_quantity,
        products(name)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (locationIds.length > 0) {
    transferQuery = transferQuery.or(`from_location_id.in.(${locationIds.join(",")}),to_location_id.in.(${locationIds.join(",")})`);
  }

  let { data: transfers, error: transferError } = await transferQuery;

  // Fallback if column doesn't exist yet
  if (transferError && (transferError.code === "42703" || (transferError as any).status === 400)) {
    let fallbackQuery = client
      .from("stock_transfers")
      .select(`
        id,
        status,
        created_at,
        created_by,
        from_location_id,
        to_location_id,
        users(full_name),
        stock_transfer_items(
          id,
          product_id,
          available_quantity,
          transfer_quantity,
          products(name)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (locationIds.length > 0) {
      fallbackQuery = fallbackQuery.or(`from_location_id.in.(${locationIds.join(",")}),to_location_id.in.(${locationIds.join(",")})`);
    }

    const fallback = await fallbackQuery;
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
    fromLocationId: transfer.from_location_id,
    toLocationId: transfer.to_location_id,
    fromStock: locationMap.get(transfer.from_location_id) || "Unknown Location",
    toStock: locationMap.get(transfer.to_location_id) || "Unknown Location",
    status: mapStockStatus(transfer.status),
    createdAt: transfer.created_at ? new Date(transfer.created_at).toLocaleDateString() : "N/A",
    createdBy: transfer.users?.full_name || "Unknown",
    createdById: transfer.created_by,
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
  businessId: string,
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

export type LossOrExpenseType = "expired" | "damage" | "expense";

export type StockLossRecord = {
  id: string;
  createdAt: string;
  createdBy: string;
  createdById: string;
  locationId: string;
  locationName: string;
  productId: string;
  productName: string;
  category: LossOrExpenseType;
  quantity: number;
  unitCost: number;
  totalLossAmount: number;
  notes: string;
};

export async function recordStockLossOrExpense(params: {
  locationId: string;
  businessId: string;
  createdBy: string;
  productId: string;
  quantity: number;
  category: LossOrExpenseType;
  notes: string;
}): Promise<string> {
  if (localStorage.getItem("is_demo_mode") === "true") {
    const newDemoRecord: StockLossRecord = {
      id: `demo-loss-${Date.now()}`,
      createdAt: new Date().toLocaleString(),
      createdBy: "Demo Store Admin",
      createdById: params.createdBy || "demo-user-id",
      locationId: params.locationId,
      locationName: "Main Branch - Nyarugenge (Demo)",
      productId: params.productId,
      productName: "Big mutziing",
      category: params.category,
      quantity: params.quantity,
      unitCost: 2600,
      totalLossAmount: params.quantity * 2600,
      notes: params.notes || "Recorded loss",
    };
    DEMO_LOSS_RECORDS.unshift(newDemoRecord);
    return newDemoRecord.id;
  }

  const client = await ensureSupabaseConfigured();

  // 1. Get product details (cost price)
  const { data: prod } = await client
    .from("products")
    .select("id, name, cost_price, selling_price")
    .eq("id", params.productId)
    .maybeSingle();

  const costPrice = Number(prod?.cost_price || prod?.selling_price || 0);
  const totalLoss = params.quantity * costPrice;

  // 2. Get current stock at target location
  const { data: stockRow } = await client
    .from("product_stocks")
    .select("quantity")
    .eq("product_id", params.productId)
    .eq("location_id", params.locationId)
    .maybeSingle();

  const currentQty = stockRow ? Number(stockRow.quantity) : 0;
  const newQty = Math.max(0, currentQty - params.quantity);

  // 3. Insert Master Stock Count audit record
  const { data: master, error: masterErr } = await client
    .from("stock_counts")
    .insert({
      business_id: params.businessId,
      stock_name: `Write-Off (${params.category})`,
      location_id: params.locationId,
      created_by: params.createdBy,
      notes: params.notes,
      total_loss_value: totalLoss,
    })
    .select("id")
    .single();

  if (masterErr) throw masterErr;
  const countId = master.id;

  // 4. Insert Stock Count Item
  await client.from("stock_count_items").insert({
    business_id: params.businessId,
    stock_count_id: countId,
    product_id: params.productId,
    system_quantity: currentQty,
    adjustment_mode: "subtract",
    adjustment_reason: params.category,
    counted_quantity: params.quantity,
    final_quantity: newQty,
  });

  // 5. Update Location Stock
  await client
    .from("product_stocks")
    .upsert({
      business_id: params.businessId,
      product_id: params.productId,
      location_id: params.locationId,
      quantity: newQty,
    }, { onConflict: "product_id,location_id" });

  // 6. Update Global Product Stock
  const { data: totalStock } = await client
    .from("product_stocks")
    .select("quantity")
    .eq("product_id", params.productId);

  const newGlobalTotal = (totalStock || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  await client
    .from("products")
    .update({ stock_quantity: newGlobalTotal })
    .eq("id", params.productId);

  // 7. Insert Stock Movement
  try {
    await client.from("stock_movements").insert({
      business_id: params.businessId,
      product_id: params.productId,
      user_id: params.createdBy,
      movement_type: params.category,
      quantity: -params.quantity,
      location_id: params.locationId,
      reference_type: "stock_count",
      reference_id: countId,
      notes: params.notes || `Stock write-off: ${params.category}`,
    });
  } catch (mErr) {
    console.warn("Could not record movement_type as category, inserting standard adjustment:", mErr);
    await client.from("stock_movements").insert({
      business_id: params.businessId,
      product_id: params.productId,
      user_id: params.createdBy,
      movement_type: "out",
      quantity: -params.quantity,
      location_id: params.locationId,
      reference_type: "stock_count",
      reference_id: countId,
      notes: `Write-off (${params.category}): ${params.notes}`,
    });
  }

  return countId;
}

const DEMO_LOSS_RECORDS: StockLossRecord[] = [
  {
    id: "demo-loss-1",
    createdAt: new Date(Date.now() - 86400000).toLocaleString(),
    createdBy: "Demo Store Admin",
    createdById: "demo-user-id",
    locationId: "demo-loc-1",
    locationName: "Main Branch - Nyarugenge (Demo)",
    productId: "demo-prod-1",
    productName: "Inyange Fresh Milk 1L",
    category: "expired",
    quantity: 4,
    unitCost: 900,
    totalLossAmount: 3600,
    notes: "Expired past sell-by date (Demo)",
  },
  {
    id: "demo-loss-2",
    createdAt: new Date(Date.now() - 172800000).toLocaleString(),
    createdBy: "Demo Store Admin",
    createdById: "demo-user-id",
    locationId: "demo-loc-1",
    locationName: "Main Branch - Nyarugenge (Demo)",
    productId: "demo-prod-8",
    productName: "Mineral Water 1.5L Pack",
    category: "expense",
    quantity: 2,
    unitCost: 2600,
    totalLossAmount: 5200,
    notes: "Used for office staff hydration (Demo)",
  },
  {
    id: "demo-loss-3",
    createdAt: new Date(Date.now() - 259200000).toLocaleString(),
    createdBy: "Demo Store Admin",
    createdById: "demo-user-id",
    locationId: "demo-loc-2",
    locationName: "Kicukiro Branch (Demo)",
    productId: "demo-prod-2",
    productName: "Baking Powder 100g",
    category: "damage",
    quantity: 3,
    unitCost: 550,
    totalLossAmount: 1650,
    notes: "Damaged during warehouse unpacking (Demo)",
  }
];

export async function listStockLossesAndExpenses(): Promise<StockLossRecord[]> {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_LOSS_RECORDS;
  }
  const client = await ensureSupabaseConfigured();

  const recordsMap = new Map<string, StockLossRecord>();

  // 1. Query stock_movements
  try {
    const { data: movements } = await client
      .from("stock_movements")
      .select(`
        id,
        created_at,
        user_id,
        product_id,
        quantity,
        location_id,
        movement_type,
        notes,
        reference_id,
        products(name, cost_price, selling_price),
        locations(name),
        users(full_name)
      `)
      .in("movement_type", ["expired", "damage", "damaged", "expense", "wastage", "write-off", "loss"])
      .order("created_at", { ascending: false })
      .limit(200);

    for (const m of (movements || []) as any[]) {
      const prod = Array.isArray(m.products) ? m.products[0] : m.products;
      const loc  = Array.isArray(m.locations) ? m.locations[0] : m.locations;
      const usr  = Array.isArray(m.users)  ? m.users[0]  : m.users;
      const qty  = Math.abs(Number(m.quantity) || 0);
      const unitCost = Number(prod?.cost_price || prod?.selling_price || 0);
      const rawType = String(m.movement_type || "expense").toLowerCase();
      const category: LossOrExpenseType =
        rawType === "expired" ? "expired"
        : rawType === "damage" || rawType === "damaged" || rawType === "wastage" || rawType === "loss" ? "damage"
        : "expense";

      recordsMap.set(m.id, {
        id: m.id,
        createdAt: m.created_at ? new Date(m.created_at).toLocaleString() : "N/A",
        createdBy: usr?.full_name || "Unknown",
        createdById: m.user_id || "",
        locationId: m.location_id || "",
        locationName: loc?.name || "Unknown Location",
        productId: m.product_id || "",
        productName: prod?.name || "Unknown Product",
        category,
        quantity: qty,
        unitCost,
        totalLossAmount: qty * unitCost,
        notes: m.notes || "-",
      });
    }
  } catch (movErr) {
    console.warn("Failed querying stock_movements for losses:", movErr);
  }

  // 2. Query stock_counts & stock_count_items
  try {
    const { data: counts } = await client
      .from("stock_counts")
      .select(`
        id,
        created_at,
        created_by,
        location_id,
        notes,
        stock_name,
        total_loss_value,
        locations(name),
        users(full_name),
        stock_count_items(
          id,
          product_id,
          adjustment_reason,
          counted_quantity,
          system_quantity,
          final_quantity,
          products(name, cost_price, selling_price)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    for (const item of (counts || []) as any[]) {
      const itemsList = item.stock_count_items || [];
      const loc = Array.isArray(item.locations) ? item.locations[0] : item.locations;
      const usr = Array.isArray(item.users) ? item.users[0] : item.users;

      for (const sub of itemsList) {
        const rawReason = String(sub.adjustment_reason || item.notes || item.stock_name || "").toLowerCase();
        const isLoss = ["expired", "damage", "damaged", "expense", "wastage", "write-off", "loss"].some(k => rawReason.includes(k));
        if (!isLoss) continue;

        const qty = Number(sub.counted_quantity) || 0;
        const prod = Array.isArray(sub.products) ? sub.products[0] : sub.products;
        const unitCost = Number(prod?.cost_price || prod?.selling_price || 0);
        const category: LossOrExpenseType =
          rawReason.includes("expired") ? "expired"
          : rawReason.includes("expense") ? "expense"
          : "damage";

        const recId = sub.id || item.id;
        if (!recordsMap.has(recId)) {
          recordsMap.set(recId, {
            id: recId,
            createdAt: item.created_at ? new Date(item.created_at).toLocaleString() : "N/A",
            createdBy: usr?.full_name || "Unknown",
            createdById: item.created_by || "",
            locationId: item.location_id || "",
            locationName: loc?.name || "Unknown Location",
            productId: sub.product_id || "",
            productName: prod?.name || "Unknown Product",
            category,
            quantity: qty,
            unitCost,
            totalLossAmount: Number(item.total_loss_value) > 0 ? Number(item.total_loss_value) : qty * unitCost,
            notes: item.notes || "-",
          });
        }
      }
    }
  } catch (countErr) {
    console.warn("Failed querying stock_counts for losses:", countErr);
  }

  return Array.from(recordsMap.values());
}

export async function recordStockTransfer(
  fromLocationId: string,
  toLocationId: string,
  businessId: string,
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
    p_business_id: businessId,
    p_status: status,
    p_created_by: createdBy,
    p_items: transformedItems
  });

  if (error) throw error;
  return data;
}

export async function updateStockTransfer(
  transferId: string,
  fromLocationId: string,
  toLocationId: string,
  status: "pending" | "in_transit",
  userId: string,
  items: Array<{ productId: string; availableQuantity: number; transferQuantity: number }>
) {
  const client = await ensureSupabaseConfigured();

  const { data: existing, error: existingError } = await client
    .from("stock_transfers")
    .select("id, status, created_by, business_id")
    .eq("id", transferId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing) throw new Error("Transfer not found.");
  if (existing.status === "completed") throw new Error("Completed transfers cannot be edited.");
  if (existing.created_by !== userId) throw new Error("Only the user who created this transfer can edit it.");

  const transformedItems = items.map(item => ({
    stock_transfer_id: transferId,
    business_id: existing.business_id,
    product_id: item.productId,
    available_quantity: item.availableQuantity,
    transfer_quantity: item.transferQuantity
  }));

  const { error: transferError } = await client
    .from("stock_transfers")
    .update({
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      status,
    })
    .eq("id", transferId);

  if (transferError) throw transferError;

  const { error: deleteError } = await client
    .from("stock_transfer_items")
    .delete()
    .eq("stock_transfer_id", transferId);

  if (deleteError) throw deleteError;

  const { error: insertError } = await client
    .from("stock_transfer_items")
    .insert(transformedItems);

  if (insertError) throw insertError;
}

export async function updateStockTransferStatus(
  transferId: string,
  newStatus: "pending" | "in_transit" | "completed",
  userId: string
) {
  const client = await ensureSupabaseConfigured();
  const { data: transfer, error: transferError } = await client
    .from("stock_transfers")
    .select("status, created_by")
    .eq("id", transferId)
    .maybeSingle();

  if (transferError) throw transferError;
  if (!transfer) throw new Error("Transfer not found.");
  if (transfer.status === "completed") throw new Error("Completed transfers cannot be changed.");
  if (newStatus === "completed" && transfer.created_by === userId) {
    throw new Error("The user who created the transfer cannot complete it. Ask a receiving branch user to confirm it.");
  }

  const { error } = await client.rpc("update_stock_transfer_status", {
    p_transfer_id: transferId,
    p_new_status: newStatus,
    p_user_id: userId
  });

  if (error) throw error;
}
