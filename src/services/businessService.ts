import { ensureSupabaseConfigured, withRetry } from "./supabaseUtils";
import type { BusinessRecord } from "../types/database";

export async function getBusinessDetails(businessId: string): Promise<BusinessRecord | null> {
  const client = await ensureSupabaseConfigured();
  
  return withRetry(async () => {
    const { data, error } = await client
      .from("businesses")
      .select("*")
      .eq("id", businessId)
      .maybeSingle();

    if (error) throw error;
    return data;
  });
}

export async function updateBusinessSubscription(
  businessId: string, 
  updates: Partial<Pick<BusinessRecord, "subscription_start_date" | "subscription_end_date" | "status">>
): Promise<void> {
  const client = await ensureSupabaseConfigured();
  
  const { error } = await client
    .from("businesses")
    .update(updates)
    .eq("id", businessId);

  if (error) throw error;
}

export async function getAllBusinesses(): Promise<BusinessRecord[]> {
  const client = await ensureSupabaseConfigured();
  
  const { data, error } = await client
    .from("businesses")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getBusinessStats(businessId: string) {
  const client = await ensureSupabaseConfigured();
  
  const [usersCount, productsCount, salesTotal] = await Promise.all([
    client.from("users").select("*", { count: "exact", head: true }).eq("business_id", businessId),
    client.from("products").select("*", { count: "exact", head: true }).eq("business_id", businessId),
    client.from("sales").select("total_amount").eq("business_id", businessId)
  ]);

  const totalSales = (salesTotal.data as any[] || []).reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

  return {
    userCount: usersCount.count || 0,
    productCount: productsCount.count || 0,
    totalSales
  };
}
