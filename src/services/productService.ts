import { ensureSupabaseConfigured } from "./supabaseUtils";
import type { ProductRecord, Category } from "../types/database";
import { db } from "../lib/db";

export type ProductFormValues = {
  name: string;
  category_id?: string;
  barcode: string;
  cost_price: string | number;
  selling_price: string | number;
  image_url: string;
  bulk_quantity?: string | number | null;
  bulk_price?: string | number | null;
  parent_id?: string | null;
  is_parent?: boolean;
  variant_combination?: any;
};

export type ProductAttribute = {
  id: string;
  business_id: string;
  name: string;
  created_at: string;
};

export type ProductAttributeValue = {
  id: string;
  attribute_id: string;
  value: string;
  created_at: string;
};

function mapProductPayload(values: ProductFormValues) {
  const bulkQty = values.bulk_quantity !== undefined && values.bulk_quantity !== null && values.bulk_quantity !== ''
    ? Number(values.bulk_quantity)
    : null;
  const bulkPrice = values.bulk_price !== undefined && values.bulk_price !== null && values.bulk_price !== ''
    ? Number(values.bulk_price)
    : null;
  return {
    name: (values.name || '').trim(),
    category_id: values.category_id || null,
    barcode: (values.barcode || '').trim() || null,
    cost_price: Number(values.cost_price || 0),
    selling_price: Number(values.selling_price || 0),
    stock_quantity: 0,
    reorder_level: 5,
    image_url: (values.image_url || '').trim() || null,
    bulk_quantity: bulkQty,
    bulk_price: bulkPrice,
    parent_id: values.parent_id || null,
    is_parent: values.is_parent || false,
    variant_combination: values.variant_combination || null,
  };
}

export async function listProducts(locationId?: string | null) {
  const isOnline = navigator.onLine;

  if (isOnline) {
    try {
      const client = await ensureSupabaseConfigured();
      
      const selectQuery = locationId ? `
        *,
        product_stocks(quantity, location_id)
      ` : '*';

      const { data, error } = await client
        .from("products")
        .select(selectQuery)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      let parsedData: ProductRecord[] = [];

      if (locationId) {
        parsedData = (data || []).map((product: any) => {
          let branchStock = product.stock_quantity; // fallback to global
          if (product.product_stocks && Array.isArray(product.product_stocks)) {
            const stockEntry = product.product_stocks.find((s: any) => s.location_id === locationId);
            if (stockEntry !== undefined) {
              branchStock = stockEntry.quantity;
            }
          }
          return {
            ...product,
            stock_quantity: branchStock,
            product_stocks: undefined
          };
        }) as ProductRecord[];
      } else {
        parsedData = (data || []) as unknown as ProductRecord[];
      }

      // Cache the result in Dexie
      try {
        const businessId = parsedData.length > 0 ? parsedData[0].business_id : 'unknown';
        await db.cached_products.bulkPut(parsedData.map(p => ({
          id: p.id,
          business_id: businessId,
          data: p,
          updated_at: new Date().toISOString()
        })));
      } catch (cacheErr) {
        console.warn("Failed to cache products locally:", cacheErr);
      }

      return parsedData;
    } catch (err: any) {
      if (err?.message !== 'Failed to fetch' && !err?.message?.includes('network')) {
        throw err;
      }
      console.warn("Network error, falling back to offline products cache.");
    }
  }

  // Fallback to Dexie
  const cached = await db.cached_products.toArray();
  return cached.map(c => c.data) as ProductRecord[];
}

export async function listCategories() {
  const isOnline = navigator.onLine;

  if (isOnline) {
    try {
      const client = await ensureSupabaseConfigured();
      const { data, error } = await client
        .from("categories")
        .select("*")
        .order("name", { ascending: true });

      if (error) {
        throw error;
      }

      const result = (data ?? []) as Category[];
      
      try {
        await db.cached_categories.bulkPut(result.map(c => ({
          id: c.id,
          data: c
        })));
      } catch (cacheErr) {
        console.warn("Failed to cache categories.", cacheErr);
      }

      return result;
    } catch (err: any) {
      if (err?.message !== 'Failed to fetch' && !err?.message?.includes('network')) {
        throw err;
      }
      console.warn("Network error, falling back to offline categories cache.");
    }
  }

  const cached = await db.cached_categories.toArray();
  return cached.map(c => c.data) as Category[];
}

export async function createCategory(name: string) {
  const client = await ensureSupabaseConfigured();
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Category name is required.");
  }

  const { data, error } = await client
    .from("categories")
    .insert({
      name: trimmedName,
    })
    .select()
    .single();

  if (error) {
    const anyErr = error as any;
    if (anyErr?.code === "23505") {
      throw new Error("Category already exists.");
    }
    if (typeof anyErr?.message === "string" && anyErr.message.toLowerCase().includes("row-level security")) {
      throw new Error("You don't have permission to create categories.");
    }
    throw error;
  }

  return data as Category;
}

export async function createProduct(values: ProductFormValues) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("products")
    .insert(mapProductPayload(values))
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as ProductRecord;
}

export async function updateProduct(productId: string, values: ProductFormValues) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("products")
    .update(mapProductPayload(values))
    .eq("id", productId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as ProductRecord;
}

export async function deleteProduct(productId: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client.from("products").delete().eq("id", productId);

  if (error) {
    throw error;
  }
}

export async function bulkImportProducts(businessId: string, locationId: string | null, products: any[]) {
  const client = await ensureSupabaseConfigured();
  
  const { data, error } = await client.rpc('bulk_import_products', {
    p_business_id: businessId,
    p_location_id: locationId,
    p_products_json: products
  });

  if (error) {
    throw error;
  }
  
  return data;
}

// Attribute Management Functions
export async function listAttributes() {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("product_attributes")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data as ProductAttribute[];
}

export async function createAttribute(name: string) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("product_attributes")
    .insert({ name: name.trim() })
    .select()
    .single();

  if (error) throw error;
  return data as ProductAttribute;
}

export async function deleteAttribute(id: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client.from("product_attributes").delete().eq("id", id);
  if (error) throw error;
}

export async function listAttributeValues(attributeId: string) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("product_attribute_values")
    .select("*")
    .eq("attribute_id", attributeId)
    .order("value", { ascending: true });

  if (error) throw error;
  return data as ProductAttributeValue[];
}

export async function createAttributeValue(attributeId: string, value: string) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("product_attribute_values")
    .insert({ attribute_id: attributeId, value: value.trim() })
    .select()
    .single();

  if (error) throw error;
  return data as ProductAttributeValue;
}

export async function deleteAttributeValue(id: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client.from("product_attribute_values").delete().eq("id", id);
  if (error) throw error;
}
