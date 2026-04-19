import { ensureSupabaseConfigured } from "./supabaseUtils";

export async function listUsers() {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("users")
    .select("id, full_name, role")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) throw error;
  return data;
}
