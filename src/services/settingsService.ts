import type { AppRole, ShopSettingsRecord, UserPermissionRecord, UserProfile } from "../types/database";
import { ensureSupabaseConfigured } from "./supabaseUtils";

export async function listStaffAccounts() {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("users")
    .select(`*, user_permissions(*), locations!users_location_id_fkey(name), user_locations(location_id)`)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as any[];
}

export async function upsertUserLocations(userId: string, locationIds: string[]) {
  const client = await ensureSupabaseConfigured();
  
  // Clear existing
  await client.from("user_locations").delete().eq("user_id", userId);
  
  if (locationIds.length === 0) return;
  
  // Insert new
  const { error } = await client.from("user_locations").insert(
    locationIds.map(locId => ({ user_id: userId, location_id: locId }))
  );
  
  if (error) throw error;
}

export async function createStaffAccount(values: {
  email: string;
  password: string;
  full_name: string;
  role: AppRole;
  location_id?: string | null;
  permissions?: Array<{
    module_key: string;
    can_view: boolean;
    can_add: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>;
  business_id: string;
}) {
  const client = await ensureSupabaseConfigured();
  
  const { data: authUserId, error } = await client.rpc('admin_create_staff', {
    p_business_id: values.business_id,
    p_email: values.email,
    p_password: values.password,
    p_full_name: values.full_name,
    p_role: values.role,
    p_location_id: values.location_id || null
  });

  if (error) {
    throw error;
  }

  if (!authUserId) {
    throw new Error("Failed to create auth user.");
  }

  const { data: profile, error: profileError } = await client
    .from("users")
    .select("*")
    .eq("auth_user_id", authUserId)
    .single();

  if (profileError) {
    throw profileError;
  }

  if (values.permissions && values.permissions.length > 0) {
    await upsertUserPermissions(profile.id, values.permissions);
  }

  return profile as UserProfile;
}

export async function updateUserProfile(userId: string, values: {
  full_name: string;
  email: string;
  role: AppRole;
  location_id?: string | null;
}) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("users")
    .update({
      full_name: values.full_name,
      email: values.email,
      role: values.role,
      location_id: values.location_id || null,
    })
    .eq("id", userId)
    .single();

  if (error) {
    throw error;
  }

  return data as UserProfile;
}

export async function upsertUserPermissions(
  userId: string,
  permissions: Array<{
    module_key: string;
    can_view: boolean;
    can_add: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>,
) {
  const client = await ensureSupabaseConfigured();

  const { error: deleteError } = await client.from("user_permissions").delete().eq("user_id", userId);
  if (deleteError) {
    throw deleteError;
  }

  if (permissions.length === 0) {
    return [];
  }

  const { data, error } = await client.from("user_permissions").insert(
    permissions.map((permission) => ({
      user_id: userId,
      module_key: permission.module_key,
      can_view: permission.can_view,
      can_add: permission.can_add,
      can_edit: permission.can_edit,
      can_delete: permission.can_delete,
    })),
  ).select();

  if (error) {
    throw error;
  }

  return (data ?? []) as UserPermissionRecord[];
}

export async function deleteUserProfile(userId: string) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("users")
    .delete()
    .eq("id", userId);

  if (error) {
    throw error;
  }

  return data;
}

export async function listUserPermissions(userId: string) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("user_permissions")
    .select("*")
    .eq("user_id", userId)
    .order("module_key", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as UserPermissionRecord[];
}

export async function getShopSettingsRecord() {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("shop_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ShopSettingsRecord | null;
}

export async function upsertShopSettings(
  values: Partial<Omit<ShopSettingsRecord, "created_at" | "updated_at">> & { id?: string | null; updated_by?: string | null },
) {
  const client = await ensureSupabaseConfigured();
  const payload = {
    id: values.id ?? undefined,
    shop_name: values.shop_name,
    logo_url: values.logo_url ?? null,
    address: values.address ?? null,
    contact_phone: values.contact_phone ?? null,
    contact_email: values.contact_email ?? null,
    currency_code: values.currency_code ?? "RWF",
    default_profit_percentage: values.default_profit_percentage ?? 30,
    tax_percentage: values.tax_percentage ?? 18,
    updated_by: values.updated_by ?? null,
  };

  const query = client.from("shop_settings");
  const statement = values.id
    ? query.upsert([payload], { onConflict: "id" })
    : query.insert(payload);

  const { data, error } = await statement.select().single();

  if (error) {
    throw error;
  }

  return data as ShopSettingsRecord;
}

export async function listLocations() {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("locations")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export async function createLocation(name: string) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("locations")
    .insert([{ name }])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateLocation(id: string, updates: { name?: string; is_active?: boolean }) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("locations")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteLocation(id: string) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("locations")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }

  return data;
}

export async function resetStaffPassword(targetAuthUserId: string, newPassword: string) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client.rpc('admin_reset_user_password', {
    p_target_auth_id: targetAuthUserId,
    p_new_password: newPassword
  });

  if (error) {
    throw error;
  }

  return data;
}
