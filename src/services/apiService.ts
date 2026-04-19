import { ensureSupabaseConfigured } from "./supabaseUtils";

export type ApiKeyRecord = {
  id: string;
  business_id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
};

export async function listApiKeys() {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("api_keys")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as ApiKeyRecord[];
}

export async function generateApiKey(name: string) {
  const client = await ensureSupabaseConfigured();
  
  // In a real app, generate a secure random string. 
  // For this demo, we'll use a prefix + random uuid part.
  const prefix = "ag_live_";
  const randomPart = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const fullKey = `${prefix}${randomPart}`;
  
  // We hash the key before saving (using a simple mock hash here, 
  // in production use a proper cryptographic hash like SHA-256).
  const keyHash = fullKey; // Placeholder for real hashing

  const { data, error } = await client
    .from("api_keys")
    .insert({
      name: name.trim(),
      key_hash: keyHash,
      key_prefix: prefix,
    })
    .select()
    .single();

  if (error) throw error;
  
  // Return the full key ONLY once to the user
  return { ...data, fullKey } as ApiKeyRecord & { fullKey: string };
}

export async function revokeApiKey(id: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client
    .from("api_keys")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
