import { supabase, supabaseConfigured } from "../lib/supabase";

export async function ensureSupabaseConfigured() {
  if (!supabaseConfigured) {
    throw new Error(
      "Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to continue.",
    );
  }

  return supabase;
}

/**
 * Retries an async operation if it fails due to network errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Retry on network errors or timeouts
    const isNetworkError = 
      error?.message?.includes('fetch') || 
      error?.message?.includes('network') ||
      error?.status === 0 ||
      error?.code === 'PGRST301'; // Supabase timeout or connection issue

    if (retries > 0 && isNetworkError) {
      console.warn(`Network error detected. Retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}
