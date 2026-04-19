import type { Session } from "@supabase/supabase-js";
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { getCurrentProfile, getSession, signInWithPassword, signOut } from "../services/authService";
import type { AppRole, UserProfile, LocationRecord, BusinessRecord } from "../types/database";
import { LoadingPOS } from "../components/ui/LoadingPOS";

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

async function loadProfile(session: Session | null) {
  if (!session?.user) {
    return null;
  }

  return getCurrentProfile(session.user.id);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [business, setBusiness] = useState<BusinessRecord | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(localStorage.getItem("active_location_id"));
  const [assignedLocations, setAssignedLocations] = useState<LocationRecord[]>([]);
  const [impersonatedBusinessId, setImpersonatedBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { isSubscriptionActive, subscriptionDaysLeft } = useMemo(() => {
    // 1. Super admins always bypass status/expiry checks
    if (profile?.role === 'super_admin') return { isSubscriptionActive: true, subscriptionDaysLeft: null };
    
    const biz = profile?.business;
    if (!biz) return { isSubscriptionActive: false, subscriptionDaysLeft: null };
    
    // 🚫 Suspended -> manually blocked
    if (biz.status === 'suspended') return { isSubscriptionActive: false, subscriptionDaysLeft: 0 };
    
    const now = new Date();
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
  }, [profile]);

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
        const currentSession = await getSession();
        const currentProfile = await loadProfile(currentSession);

        if (isMounted) {
          setSession(currentSession);
          setProfile(currentProfile);
          
          if (currentProfile) {
            setProfile(currentProfile);
            setBusiness(currentProfile.business || null);
            localStorage.setItem("cached_user_profile", JSON.stringify(currentProfile));
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

      void loadProfile(nextSession)
        .then((nextProfile) => {
          if (isMounted) {
            setProfile(nextProfile);
            setBusiness(nextProfile?.business || null);
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

  if (loading) {
    return <LoadingPOS />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
