import { ensureSupabaseConfigured } from "./supabaseUtils";

export interface ProductVariant {
  id: string;
  product_id: string;
  variant_label: string;
  sku: string | null;
  additional_price: number;
  stock_quantity: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateVariantInput {
  product_id: string;
  variant_label: string;
  sku?: string;
  additional_price?: number;
  stock_quantity?: number;
}

export async function listProductVariants(productId: string) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("product_variants")
    .select("*")
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProductVariant[];
}

export async function createProductVariant(input: CreateVariantInput) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("product_variants")
    .insert({
      product_id: input.product_id,
      variant_label: input.variant_label.trim(),
      sku: input.sku?.trim() || null,
      additional_price: input.additional_price ?? 0,
      stock_quantity: input.stock_quantity ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProductVariant;
}

export async function updateProductVariant(
  id: string,
  updates: Partial<Omit<CreateVariantInput, "product_id">> & { is_active?: boolean; stock_quantity?: number }
) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("product_variants")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as ProductVariant;
}

export async function deleteProductVariant(id: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client
    .from("product_variants")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}
