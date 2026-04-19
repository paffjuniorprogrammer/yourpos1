import type { Session } from "@supabase/supabase-js";
import type { UserProfile } from "../types/database";
import { ensureSupabaseConfigured, withRetry } from "./supabaseUtils";

export async function signInWithPassword(email: string, password: string) {
  const client = await ensureSupabaseConfigured();
  const { data: authData, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    throw error;
  }

  if (authData?.user) {
    return getCurrentProfile(authData.user.id);
  }
  
  return null;
}

export async function signOut() {
  const client = await ensureSupabaseConfigured();
  const { error } = await client.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function signUpWithPassword(email: string, password: string, role: string, fullName: string) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { role, full_name: fullName } },
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function getSession(): Promise<Session | null> {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export async function getCurrentProfile(authUserId: string): Promise<UserProfile | null> {
  const client = await ensureSupabaseConfigured();
  
  return withRetry(async () => {
    try {
      // Fetch user data with relationships in ONE parallel query step for max speed
      const [{ data: user, error: userError }, platformAdminResult, allLocsResult] = await Promise.all([
        client
          .from("users")
          .select(`
            *,
            user_permissions (*),
            user_locations (location:locations(*)),
            business:businesses (*)
          `)
          .eq("auth_user_id", authUserId)
          .maybeSingle(),
        client.from("platform_admins").select("auth_user_id").eq("auth_user_id", authUserId).maybeSingle(),
        client.from("locations").select("*").eq("is_active", true) // Fetch globals concurrently
      ]);

      if (userError) throw userError;
      if (!user) return null;

      const data = { ...user } as any;
      
      // Force super_admin role if user is in platform_admins table
      if (platformAdminResult.data) {
        data.role = 'super_admin';
      }

      data.user_permissions = user.user_permissions || [];
      // business relation returns as object or array depending on PostgREST mapping
      data.business = Array.isArray(user.business) ? user.business[0] : user.business;
      
      const assigned = (user.user_locations as any)?.map((ul: any) => ul.location) || [];
      
      if (data.role === "admin" || data.role === "super_admin") {
        data.assigned_locations = allLocsResult.data || [];
      } else {
        data.assigned_locations = assigned;
      }

      return data as UserProfile;
    } catch (err) {
      console.error("Failed to fetch user profile:", err);
      throw err;
    }
  });
}
