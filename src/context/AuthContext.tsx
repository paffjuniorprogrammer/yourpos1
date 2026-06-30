import type { Session } from "@supabase/supabase-js";
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { getCurrentProfile, getSession, signInWithPassword, signOut } from "../services/authService";
import type { AppRole, UserProfile, LocationRecord, BusinessRecord } from "../types/database";
import i18n from "../i18n";

type AuthContextValue = {
  session: Session | null;
  profile: UserProfile | null;
  business: BusinessRecord | null;
  isSubscriptionActive: boolean;
  subscriptionDaysLeft: number | null;
  activeLocationId: string | null;
  assignedLocations: LocationRecord[];
  switchLocation: (id: string) => void;
  loading: boolean;
  authConfigured: boolean;
  signIn: (email: string, password: string) => Promise<UserProfile | null>;
  logout: () => Promise<void>;
  impersonateBusiness: (id: string | null) => void;
  hasRole: (...roles: AppRole[]) => boolean;
  can: (module: string, action: "view" | "add" | "edit" | "delete") => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const AUTH_BOOT_TIMEOUT_MS = 12000;
const MAX_SUBSCRIPTION_TIMER_MS = 2_147_483_647;

function withAuthTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), AUTH_BOOT_TIMEOUT_MS),
    ),
  ]);
}

async function loadProfile(session: Session | null) {
  if (!session?.user) {
    return null;
  }

  return getCurrentProfile(session.user.id);
}

async function loadBusiness(businessId: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle();

  if (error) throw error;
  return data as BusinessRecord | null;
}

function applyProfileLanguage(profile: UserProfile | null) {
  if (profile?.language && profile.language !== i18n.language) {
    i18n.changeLanguage(profile.language);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [business, setBusiness] = useState<BusinessRecord | null>(null);
  const [subscriptionCheckTime, setSubscriptionCheckTime] = useState(() => Date.now());
  const [activeLocationId, setActiveLocationId] = useState<string | null>(localStorage.getItem("active_location_id"));
  const [assignedLocations, setAssignedLocations] = useState<LocationRecord[]>([]);
  const [impersonatedBusinessId, setImpersonatedBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function applyBusiness(nextBusiness: BusinessRecord | null) {
    setBusiness(nextBusiness);
    setSubscriptionCheckTime(Date.now());

    setProfile((currentProfile) => {
      if (!currentProfile || !nextBusiness || currentProfile.business_id !== nextBusiness.id) {
        return currentProfile;
      }

      const nextProfile = { ...currentProfile, business: nextBusiness };
      localStorage.setItem("cached_user_profile", JSON.stringify(nextProfile));
      return nextProfile;
    });
  }

  const { isSubscriptionActive, subscriptionDaysLeft } = useMemo(() => {
    // 1. Super admins always bypass status/expiry checks
    if (profile?.role === 'super_admin') return { isSubscriptionActive: true, subscriptionDaysLeft: null };
    
    const biz = business ?? profile?.business;
    if (!biz) return { isSubscriptionActive: false, subscriptionDaysLeft: null };
    
    // 🚫 Suspended -> manually blocked
    if (biz.status === 'suspended') return { isSubscriptionActive: false, subscriptionDaysLeft: 0 };
    
    const now = new Date(subscriptionCheckTime);
    let daysLeft = null;

    if (biz.subscription_end_date) {
      const expiry = new Date(biz.subscription_end_date);
      const diffTime = expiry.getTime() - now.getTime();
      daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (expiry < now) return { isSubscriptionActive: false, subscriptionDaysLeft: daysLeft };
    }
    
    // ✅ Active -> can login
    return { 
      isSubscriptionActive: biz.status === 'active', 
      subscriptionDaysLeft: daysLeft 
    };
  }, [business, profile, subscriptionCheckTime]);

  // Derive assigned locations whenever profile changes
  useEffect(() => {
    if (profile) {
      const assigned = profile.assigned_locations || [];
      setAssignedLocations(assigned);
      
      if (!activeLocationId || !assigned.find(l => l.id === activeLocationId)) {
        const firstId = assigned[0]?.id || null;
        if (firstId) {
          setActiveLocationId(firstId);
          localStorage.setItem("active_location_id", firstId);
        }
      }
    } else {
      setAssignedLocations([]);
      setActiveLocationId(null);
    }
  }, [profile, activeLocationId]);

  const switchLocation = (id: string) => {
    if (assignedLocations.find(l => l.id === id)) {
      setActiveLocationId(id);
      localStorage.setItem("active_location_id", id);
    }
  };

  useEffect(() => {
    if (!business?.subscription_end_date || profile?.role === 'super_admin') {
      return;
    }

    const expiryMs = new Date(business.subscription_end_date).getTime();
    const msUntilExpiry = expiryMs - Date.now();

    if (msUntilExpiry <= 0) {
      setSubscriptionCheckTime(Date.now());
      return;
    }

    const timer = window.setTimeout(
      () => setSubscriptionCheckTime(Date.now()),
      Math.min(msUntilExpiry + 1000, MAX_SUBSCRIPTION_TIMER_MS),
    );

    return () => window.clearTimeout(timer);
  }, [business?.subscription_end_date, profile?.role]);

  useEffect(() => {
    if (!supabaseConfigured || !profile?.business_id || profile.role === 'super_admin') {
      return;
    }

    let isActive = true;
    const businessId = profile.business_id;

    async function refreshBusiness() {
      try {
        const freshBusiness = await loadBusiness(businessId);
        if (isActive && freshBusiness) {
          applyBusiness(freshBusiness);
        }
      } catch (err) {
        console.error("Failed to refresh business subscription:", err);
      }
    }

    void refreshBusiness();

    const channel = supabase
      .channel(`business-subscription-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "businesses",
          filter: `id=eq.${businessId}`,
        },
        (payload) => {
          if (isActive) {
            applyBusiness(payload.new as BusinessRecord);
          }
        },
      )
      .subscribe();

    const refreshInterval = window.setInterval(refreshBusiness, 60_000);

    return () => {
      isActive = false;
      window.clearInterval(refreshInterval);
      void supabase.removeChannel(channel);
    };
  }, [profile?.business_id, profile?.role]);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function bootstrap() {
      const cachedProfile = localStorage.getItem("cached_user_profile");

      if (cachedProfile) {
        try {
          const parsed = JSON.parse(cachedProfile);
          if (isMounted) {
            setProfile(parsed);
            setBusiness(parsed.business || null);
          }
        } catch (e) {
          console.error("Cache parsing error:", e);
        }
      }

      try {
        const currentSession = await withAuthTimeout(getSession(), "Session loading");
        const currentProfile = await withAuthTimeout(loadProfile(currentSession), "Profile loading");

        if (isMounted) {
          setSession(currentSession);
          setProfile(currentProfile);
          
          if (currentProfile) {
            setProfile(currentProfile);
            setBusiness(currentProfile.business || null);
            localStorage.setItem("cached_user_profile", JSON.stringify(currentProfile));
            applyProfileLanguage(currentProfile);
          }
        }
      } catch (err) {
        console.error("Error during auth bootstrap:", err);
        if (isMounted) {
          setProfile(null);
          setBusiness(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, nextSession) => {
      if (isMounted) {
        setSession(nextSession);
      }

      void withAuthTimeout(loadProfile(nextSession), "Profile loading")
        .then((nextProfile) => {
          if (isMounted) {
            setProfile(nextProfile);
            setBusiness(nextProfile?.business || null);
            if (nextProfile) applyProfileLanguage(nextProfile);
          }
        })
        .catch((err) => {
          console.error("Error loading profile after auth change:", err);
          if (isMounted) {
            setProfile(null);
            setBusiness(null);
          }
        });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      business,
      isSubscriptionActive,
      subscriptionDaysLeft,
      activeLocationId,
      assignedLocations,
      switchLocation,
      loading,
      authConfigured: supabaseConfigured,
      signIn: async (email, password) => {
        const profile = await signInWithPassword(email, password);
        if (profile) {
          setProfile(profile);
          setBusiness(profile.business || null);
          localStorage.setItem("cached_user_profile", JSON.stringify(profile));
          applyProfileLanguage(profile);
        }
        return profile;
      },
      logout: async () => {
        try {
          await signOut();
        } finally {
          setSession(null);
          setProfile(null);
          setBusiness(null);
          setImpersonatedBusinessId(null);
          localStorage.removeItem("cached_user_profile");
          sessionStorage.removeItem("pos_session_loaded");
          
          try {
            const { db } = await import("../lib/db");
            await Promise.all(db.tables.map(t => t.clear()));
          } catch (e) {
            console.error("Failed to clear local cache:", e);
          }
          
          window.location.href = "/login";
        }
      },
      impersonateBusiness: (id: string | null) => {
        if (profile?.role === 'super_admin') {
          setImpersonatedBusinessId(id);
        }
      },
      hasRole: (...roles: AppRole[]) => {
        if (!profile) {
          return false;
        }

        if (profile.role === "super_admin") return true;
        return roles.includes(profile.role);
      },
      can: (module: string, action: "view" | "add" | "edit" | "delete") => {
        if (!profile) return false;
        if (profile.role === "admin" || profile.role === "super_admin") return true;
        if (!profile.user_permissions) return false;

        const perm = profile.user_permissions.find(
          (p) => p.module_key.toLowerCase() === module.toLowerCase()
        );

        if (!perm) return false;

        switch (action) {
          case "view": return perm.can_view;
          case "add": return perm.can_add;
          case "edit": return perm.can_edit;
          case "delete": return perm.can_delete;
          default: return false;
        }
      },
    }),
    [loading, profile, session, business, isSubscriptionActive, subscriptionDaysLeft, activeLocationId, assignedLocations, impersonatedBusinessId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
