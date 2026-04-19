import { ensureSupabaseConfigured } from "./supabaseUtils";

export interface ReturnItemInput {
  sale_item_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  restock: boolean;
}

export async function processReturn(input: {
  sale_id: string;
  created_by: string;
  reason: string;
  refund_method: string;
  notes: string;
  items: ReturnItemInput[];
}) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client.rpc("process_sale_return", {
    p_sale_id:       input.sale_id,
    p_created_by:    input.created_by,
    p_reason:        input.reason,
    p_refund_method: input.refund_method,
    p_notes:         input.notes,
    p_items: input.items.map((i) => ({
      sale_item_id: i.sale_item_id,
      product_id:   i.product_id,
      quantity:     i.quantity,
      unit_price:   i.unit_price,
      restock:      i.restock,
    })),
  });
  if (error) throw error;
  return data as string; // return_id
}

export async function approveReturn(returnId: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client.rpc("apply_return_restock", {
    p_return_id: returnId
  });
  if (error) throw error;

  // Update status
  const { error: updateError } = await client
    .from("sale_returns")
    .update({ status: "completed" })
    .eq("id", returnId);
  
  if (updateError) throw updateError;
}

export async function listReturns() {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("sale_returns")
    .select(`*, sale_return_items(*, products(name)), sales(sale_number)`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as any[];
}
