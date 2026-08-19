import { ensureSupabaseConfigured } from "./supabaseUtils";
import type { ProductRecord, Category } from "../types/database";
import { db } from "../lib/db";

const FAST_CACHE_TIMEOUT_MS = 500;

function withFastCacheTimeout<T>(promise: PromiseLike<T>) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Network timeout, using local cache.")), FAST_CACHE_TIMEOUT_MS),
    ),
  ]);
}

export type ProductFormValues = {
  name: string;
  category_id?: string;
  barcode?: string;
  cost_price: string | number;
  selling_price: string | number;
  image_url?: string;
  bulk_quantity?: string | number | null;
  bulk_price?: string | number | null;
  bulk_pricing_mode?: 'fixed' | 'discount_amount' | 'discount_percentage' | null;
  bulk_discount_value?: string | number | null;
  parent_id?: string | null;
  is_parent?: boolean;
  variant_combination?: any;
  location_ids?: string[];
  all_locations?: boolean;
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

function mapProductPayload(values: ProductFormValues, businessId?: string) {
  const bulkQty = values.bulk_quantity !== undefined && values.bulk_quantity !== null && values.bulk_quantity !== ''
    ? Number(values.bulk_quantity)
    : null;
  const bulkPrice = values.bulk_price !== undefined && values.bulk_price !== null && values.bulk_price !== ''
    ? Number(values.bulk_price)
    : null;
  const bulkDiscountValue = values.bulk_discount_value !== undefined && values.bulk_discount_value !== null && values.bulk_discount_value !== ''
    ? Number(values.bulk_discount_value)
    : null;
  return {
    name: (values.name || '').trim(),
    business_id: businessId,
    category_id: values.category_id || null,
    barcode: (values.barcode || '').trim() || null,
    cost_price: Number(values.cost_price || 0),
    selling_price: Number(values.selling_price || 0),
    stock_quantity: 0,
    reorder_level: 5,
    image_url: (values.image_url || '').trim() || null,
    bulk_quantity: bulkQty,
    bulk_price: bulkPrice,
    bulk_pricing_mode: values.bulk_pricing_mode || null,
    bulk_discount_value: bulkDiscountValue,
  };
}

export async function listProducts(locationId?: string | null, businessId?: string) {
  const isOnline = navigator.onLine;

  if (isOnline) {
    try {
      const client = await ensureSupabaseConfigured();
      
      const baseColumns = "id, name, barcode, cost_price, selling_price, stock_quantity, reorder_level, image_url, is_active, created_at, business_id, category_id, bulk_quantity, bulk_price, bulk_pricing_mode, bulk_discount_value";
      const selectQuery = `${baseColumns}, categories(name), product_stocks(quantity, location_id)`;

      let query = client
        .from("products")
        .select(selectQuery)
        .eq("is_active", true);

      if (businessId) {
        query = query.eq("business_id", businessId);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const parsedData = (data || [])
        // A stock row is also the product's availability assignment. Do not
        // merely show zero stock at an unassigned branch: hide the product.
        .filter((product: any) => !locationId || (product.product_stocks || []).some((stock: any) => stock.location_id === locationId))
        .map((product: any) => {
        let displayStock = 0;
        
        if (product.product_stocks && Array.isArray(product.product_stocks)) {
          if (locationId) {
            // Filter by specific location
            const stockEntry = product.product_stocks.find((s: any) => s.location_id === locationId);
            displayStock = stockEntry ? stockEntry.quantity : 0;
          } else {
            // Sum all locations for "All Locations" view
            displayStock = product.product_stocks.reduce((acc: number, s: any) => acc + (s.quantity || 0), 0);
          }
        } else {
          // Fallback to legacy column if product_stocks missing
          displayStock = product.stock_quantity || 0;
        }

        return {
          ...product,
          category: product.categories?.name || 'General',
          stock_quantity: displayStock,
          product_stocks: undefined,
          categories: undefined
        };
      }) as ProductRecord[];

      // Cache the result in Dexie
      try {
        const bid = businessId || (parsedData.length > 0 ? parsedData[0].business_id : 'unknown');
        await db.cached_products.bulkPut(parsedData.map(p => ({
          id: p.id,
          business_id: bid,
          data: p,
          updated_at: new Date().toISOString()
        })));
      } catch (cacheErr) {
        console.warn("Failed to cache products locally:", cacheErr);
      }

      return parsedData.filter((product) => product.is_active !== false);
    } catch (err: any) {
      if (err?.message !== 'Failed to fetch' && !err?.message?.includes('network') && !err?.message?.includes('timeout')) {
        throw err;
      }
      console.warn("Network error, falling back to offline products cache.");
    }
  }

  // Fallback to Dexie
  const cached = await db.cached_products.toArray();
  return cached.map(c => c.data).filter((product) => product.is_active !== false) as ProductRecord[];
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
      if (err?.message !== 'Failed to fetch' && !err?.message?.includes('network') && !err?.message?.includes('timeout')) {
        throw err;
      }
      console.warn("Network error, falling back to offline categories cache.");
    }
  }

  const cached = await db.cached_categories.toArray();
  return cached.map(c => c.data) as Category[];
}

export async function createCategory(name: string, businessId: string) {
  const client = await ensureSupabaseConfigured();
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Category name is required.");
  }

  const { data, error } = await client
    .from("categories")
    .insert({
      name: trimmedName,
      business_id: businessId
    })
    .select("id, business_id, name, description, created_at")
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

export async function checkProductExists(name: string, businessId: string, excludeId?: string): Promise<boolean> {
  const client = await ensureSupabaseConfigured();
  const query = client
    .from("products")
    .select("id")
    .eq("business_id", businessId)
    .ilike("name", name.trim())
    .eq("is_active", true);

  if (excludeId) {
    query.neq("id", excludeId);
  }

  const { data, error } = await query.maybeSingle();
  
  if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found" which is expected
    throw error;
  }

  return !!data;
}

export async function getProductLocations(productId: string): Promise<string[]> {
  try {
    const client = await ensureSupabaseConfigured();
    const { data, error } = await client
      .from("product_stocks")
      .select("location_id")
      .eq("product_id", productId);
    if (error || !data) return [];
    return data.map((row: any) => row.location_id);
  } catch (err) {
    console.warn("Failed to get product locations:", err);
    return [];
  }
}

export async function syncProductLocations(
  productId: string, 
  businessId: string, 
  values: ProductFormValues
) {
  const client = await ensureSupabaseConfigured();

    let targetLocationIds: string[] = [];

    if (values.all_locations || !values.location_ids || values.location_ids.length === 0) {
      // Get all active locations for this business
      const { data: locs } = await client
        .from("locations")
        .select("id")
        .eq("business_id", businessId)
        .eq("is_active", true);

      targetLocationIds = (locs || []).map((l: any) => l.id);
    } else {
      targetLocationIds = values.location_ids;
    }

  if (targetLocationIds.length === 0) throw new Error("Select at least one active location for this product.");

  const { error } = await client.rpc("set_product_locations", {
    p_product_id: productId,
    p_location_ids: targetLocationIds,
  });
  if (error) throw error;
}

export async function createProduct(values: ProductFormValues, businessId: string) {
  // Validate required fields
  const name = (values.name || '').trim();
  const sellingPrice = Number(values.selling_price || 0);

  if (!name) {
    throw new Error("Product name is required.");
  }

  if (sellingPrice <= 0) {
    throw new Error("Selling price must be greater than 0.");
  }

  // Check for duplicates
  const exists = await checkProductExists(name, businessId);
  if (exists) {
    throw new Error(`A product named "${name}" already exists. Please use a different name.`);
  }

  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("products")
    .insert(mapProductPayload(values, businessId))
    .select("*")
    .single();

  if (error) {
    console.error("Product creation error:", error);
    if (error.code === '23505') {
      throw new Error("Product with this name or barcode already exists.");
    }
    throw error;
  }

  if (data?.id) {
    await syncProductLocations(data.id, businessId, values);
  }

  return data as ProductRecord;
}

export async function updateProduct(productId: string, values: ProductFormValues) {
  // Validate required fields
  const name = (values.name || '').trim();
  const sellingPrice = Number(values.selling_price || 0);

  if (!name) {
    throw new Error("Product name is required.");
  }

  if (sellingPrice <= 0) {
    throw new Error("Selling price must be greater than 0.");
  }

  // Get business_id from product
  const client = await ensureSupabaseConfigured();
  const { data: existingProduct, error: getError } = await client
    .from("products")
    .select("business_id")
    .eq("id", productId)
    .single();

  if (getError || !existingProduct) {
    throw new Error("Product not found.");
  }

  // Check for duplicate names (excluding this product)
  const exists = await checkProductExists(name, existingProduct.business_id, productId);
  if (exists) {
    throw new Error(`Another product named "${name}" already exists. Please use a different name.`);
  }

  const { data, error } = await client
    .from("products")
    .update(mapProductPayload(values))
    .eq("id", productId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await syncProductLocations(productId, existingProduct.business_id, values);

  // Update local cache to ensure real-time consistency across POS
  try {
    const cached = await db.cached_products.get(productId);
    if (cached) {
      await db.cached_products.put({
        ...cached,
        data: {
          ...cached.data,
          ...data
        },
        updated_at: new Date().toISOString()
      });
    }
  } catch (cacheErr) {
    console.warn("Failed to update cache on product update:", cacheErr);
  }

  return data as ProductRecord;
}

export async function deleteProduct(productId: string) {
  const client = await ensureSupabaseConfigured();
  const { count, error } = await client
    .from("products")
    .delete({ count: "exact" })
    .eq("id", productId);

  if (error) {
    const isLinkedToHistory =
      (error as any)?.code === "23503" ||
      error.message?.includes("foreign key constraint") ||
      error.message?.includes("sale_items_product_id_fkey") ||
      error.message?.includes("purchase_items_product_id_fkey");

    if (!isLinkedToHistory) {
      throw error;
    }

    const { error: archiveRpcError } = await client.rpc("archive_product", {
      p_product_id: productId,
    });

    if (archiveRpcError) {
      const { error: archiveError } = await client
        .from("products")
        .update({ is_active: false })
        .eq("id", productId);

      if (archiveError) {
        throw archiveRpcError;
      }
    }

    await db.cached_products.delete(productId);
    return;
  }

  if (count === 0) {
    throw new Error("Product was not deleted. Check your Products delete permission.");
  }

  await db.cached_products.delete(productId);
}

export async function bulkImportProducts(businessId: string, locationId: string | null, products: any[]) {
  if (!businessId) throw new Error("Business information is missing.");
  if (!locationId) throw new Error("Select the location that will receive the imported stock.");
  if (!products.length) return { imported: 0, errors: [] as string[] };

  const client = await ensureSupabaseConfigured();
  const { data, error } = await client.rpc("import_products_with_stock", {
    p_business_id: businessId,
    p_location_id: locationId,
    p_products: products,
  });
  if (error) throw error;
  return { imported: Number(data) || 0, errors: [] as string[] };
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
    .select("*")
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
    .select("*")
    .single();

  if (error) throw error;
  return data as ProductAttributeValue;
}

export async function deleteAttributeValue(id: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client.from("product_attribute_values").delete().eq("id", id);
  if (error) throw error;
}

export async function getProductHistory(productId: string) {
  const client = await ensureSupabaseConfigured();
  
  const [salesResponse, purchasesResponse] = await Promise.all([
    client
      .from("sale_items")
      .select("quantity, unit_price, line_total, sales!inner(sale_number, created_at, customers(full_name))")
      .eq("product_id", productId)
      .limit(50),
    client
      .from("purchase_items")
      .select("quantity, cost_price, line_total, purchases!inner(purchase_number, purchase_date, suppliers(name))")
      .eq("product_id", productId)
      .limit(50)
  ]);

  if (salesResponse.error) throw salesResponse.error;
  if (purchasesResponse.error) throw purchasesResponse.error;

  const sales = (salesResponse.data || [])
    .map((s: any) => ({
      date: s.sales?.created_at,
      quantity: Number(s.quantity || 0),
      price: Number(s.unit_price || 0),
      total: Number(s.line_total || 0),
      reference: s.sales?.sale_number || "Sale",
      partner: s.sales?.customers?.full_name || "Walk-in Customer"
    }))
    .filter((s) => Boolean(s.date))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  const purchases = (purchasesResponse.data || [])
    .map((p: any) => ({
      date: p.purchases?.purchase_date,
      quantity: Number(p.quantity || 0),
      price: Number(p.cost_price || 0),
      total: Number(p.line_total || 0),
      reference: p.purchases?.purchase_number || "Purchase",
      partner: p.purchases?.suppliers?.name || "Unknown Supplier"
    }))
    .filter((p) => Boolean(p.date))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  return {
    sales,
    purchases
  };
}
