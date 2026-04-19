import { Bell, LogOut, Search } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { navItems } from "../../data/mockData";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../hooks/useSettings";

export function AppShell() {
  const location = useLocation();
  const { authConfigured, hasRole, logout, profile, can, session } = useAuth();
  const isPosRoute = location.pathname === "/pos";
  const currentPage =
    navItems.find((item) => item.path === location.pathname)?.label ?? "Dashboard";
  const visibleNavItems = navItems.filter((item) => {
    if (!authConfigured) return true;
    
    // 1. Admins have omnipotent access
    if (profile?.role === "admin" || profile?.role === "super_admin") return true;

    // 2. Check for explicit permission override
    // If the user has a permission record for this module, it is authoritative
    return can(item.label, "view");
  });

  const { settings } = useSettings();

  if (isPosRoute) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-transparent text-ink">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-72 flex-col border-r border-white/70 bg-slate-950 px-6 py-8 text-white lg:flex">
          <div className="rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-sky-400 p-5 shadow-soft">
            <div className="flex items-center gap-3">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="h-10 w-10 rounded-xl object-contain bg-white/10" />
              ) : (
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center font-bold text-white">
                  {settings?.shop_name?.charAt(0) || "B"}
                </div>
              )}
              <p className="text-xs uppercase tracking-[0.35em] text-blue-100">
                {settings?.shop_name || "POS SYSTEM"}
              </p>
            </div>
            <h2 className="mt-4 text-xl font-bold line-clamp-2">
              {settings?.shop_name || "Your POS"}
            </h2>
            <p className="mt-2 text-xs text-blue-50/70">
              {settings?.address || "Fast checkout and oversight."}
            </p>
          </div>

          <nav className="mt-8 space-y-2">
            {visibleNavItems.map(({ label, path, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    isActive
                      ? "bg-white text-slate-950 shadow-soft"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold">Current Role</p>
            <p className="mt-2 text-2xl font-bold uppercase tracking-tight">
              {profile?.role 
                ? profile.role
                : session 
                  ? "Profile Missing" 
                  : "Demo Mode"}
            </p>
            <p className="mt-2 text-sm text-slate-300">
              {profile?.full_name ?? (session ? session.user.email : "Connect Supabase auth to start selling.")}
            </p>
            {authConfigured ? (
              <button
                onClick={() => void logout()}
                className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            ) : null}
          </div>
        </aside>

        <main className="flex-1 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">

          <Outlet />
        </main>
      </div>
    </div>
  );
}
