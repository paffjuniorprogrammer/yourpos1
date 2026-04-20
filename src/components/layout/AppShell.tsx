import { Bell, LogOut, Search, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { navItems } from "../../data/mockData";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../hooks/useSettings";

export function AppShell() {
  const location = useLocation();
  const { authConfigured, hasRole, logout, profile, can, session } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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
      {/* Mobile Top Bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/70 bg-slate-950 px-4 text-white lg:hidden">
        <div className="flex items-center gap-3">
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="Logo" className="h-8 w-8 rounded-lg object-contain bg-white/10" />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center font-bold text-xs">
              {settings?.shop_name?.charAt(0) || "B"}
            </div>
          )}
          <span className="text-xs font-black uppercase tracking-widest truncate max-w-[150px]">
            {settings?.shop_name || "YOUR POS"}
          </span>
        </div>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="rounded-xl bg-white/10 p-2 text-white transition hover:bg-white/20"
        >
          {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setIsMenuOpen(false)}
          />
          
          {/* Menu Drawer */}
          <div className="absolute inset-y-0 left-0 w-[280px] bg-slate-950 p-6 shadow-2xl animate-in slide-in-from-left duration-300">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-brand-500 flex items-center justify-center text-white font-bold text-xs">
                  {settings?.shop_name?.charAt(0) || "B"}
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-white">Menu</span>
              </div>
              <button onClick={() => setIsMenuOpen(false)} className="text-slate-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <nav className="space-y-1">
              {visibleNavItems.map(({ label, path, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  onClick={() => setIsMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-2xl px-4 py-4 text-sm font-bold transition-all ${
                      isActive
                        ? "bg-white text-slate-950 shadow-lg"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`
                  }
                >
                  <Icon size={20} />
                  {label}
                </NavLink>
              ))}
            </nav>

            <div className="absolute bottom-6 left-6 right-6 pt-6 border-t border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center text-xs font-black text-white border border-white/10">
                  {profile?.full_name?.charAt(0) || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-bold text-white uppercase tracking-tight">{profile?.full_name || "User"}</p>
                  <p className="truncate text-[10px] text-slate-500 font-medium">@{profile?.role || "staff"}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  void logout();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/10 py-3 text-xs font-bold text-rose-500 uppercase tracking-widest transition-all hover:bg-rose-500 hover:text-white"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
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
