import type { AppRole, ShopSettingsRecord, UserPermissionRecord, UserProfile } from "../types/database";
import { ensureSupabaseConfigured } from "./supabaseUtils";
import { db } from "../lib/db";

const FAST_CACHE_TIMEOUT_MS = 5000;

function withFastCacheTimeout<T>(promise: PromiseLike<T>) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Network timeout, using local cache.")), FAST_CACHE_TIMEOUT_MS),
    ),
  ]);
}

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
  const { error } = await client.rpc('admin_delete_staff', {
    p_target_user_id: userId
  });

  if (error) {
    throw error;
  }
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

export async function getShopSettingsRecord(businessId?: string) {
  if (navigator.onLine) {
    try {
      const client = await ensureSupabaseConfigured();
      let query = client.from("shop_settings").select("*");
      if (businessId) {
        query = query.eq("business_id", businessId);
      } else {
        query = query.order("created_at", { ascending: true }).limit(1);
      }

      const { data, error } = await withFastCacheTimeout(query.maybeSingle());

      if (error) {
        throw error;
      }

      if (data) {
        const cacheKey = businessId ? `shop_settings_${businessId}` : "shop_settings";
        await db.cached_settings.put({ id: cacheKey, data, updated_at: new Date().toISOString() });
      }
      return data as ShopSettingsRecord | null;
    } catch (error: any) {
      if (error?.message !== "Failed to fetch" && !error?.message?.includes("network") && !error?.message?.includes("timeout")) {
        throw error;
      }
    }
  }

  const cacheKey = businessId ? `shop_settings_${businessId}` : "shop_settings";
  const cached = await db.cached_settings.get(cacheKey);
  return (cached?.data ?? null) as ShopSettingsRecord | null;
}

export async function upsertShopSettings(
  values: Partial<Omit<ShopSettingsRecord, "created_at" | "updated_at">> & { id?: string | null; updated_by?: string | null; business_id?: string | null },
) {
  const client = await ensureSupabaseConfigured();
  const payload = {
    id: values.id ?? undefined,
    business_id: values.business_id ?? undefined,
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

export async function listLocations(businessId?: string) {
  if (navigator.onLine) {
    try {
      const client = await ensureSupabaseConfigured();
      let query = client
        .from("locations")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (businessId) {
        query = query.eq("business_id", businessId);
      }

      const { data, error } = await withFastCacheTimeout(query);

      if (error) {
        throw error;
      }

      const result = data ?? [];
      await db.cached_locations.bulkPut(result.map((location: any) => ({
        id: location.id,
        data: location,
        updated_at: new Date().toISOString(),
      })));
      return result;
    } catch (error: any) {
      if (error?.message !== "Failed to fetch" && !error?.message?.includes("network") && !error?.message?.includes("timeout")) {
        throw error;
      }
    }
  }

  const cached = await db.cached_locations.toArray();
  return cached.map((record) => record.data);
}

export async function createLocation(name: string) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from("locations")
    .insert([{ name }])
    .select("*")
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
    .select("*")
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

export async function updateUserLanguage(userId: string, language: string) {
  const client = await ensureSupabaseConfigured();
  const { error } = await client
    .from("users")
    .update({ language })
    .eq("id", userId);

  if (error) {
    throw error;
  }
}
