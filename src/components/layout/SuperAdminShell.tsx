import React, { useState } from "react";
import { 
  Building2, 
  LayoutDashboard, 
  LogOut, 
  CreditCard,
  Zap,
  Menu,
  X
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const superAdminNav = [
  { label: "Dashboard", path: "/super-admin", icon: LayoutDashboard },
  { label: "Businesses", path: "/super-admin/businesses", icon: Building2 },
  { label: "Subscriptions", path: "/super-admin/subscriptions", icon: CreditCard },
];

export function SuperAdminShell() {
  const { logout, profile } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const currentPage = superAdminNav.find(item => item.path === location.pathname)?.label ?? "Command Center";
  const handleShortcutClick = () => {
    setIsSidebarOpen(false);
    window.dispatchEvent(new CustomEvent("super-admin:close-popups"));
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans overflow-x-hidden">
      <div className="flex min-h-screen relative">
        {/* Mobile Backdrop */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-950 text-white shadow-2xl transition-transform duration-300 transform lg:static lg:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}>
          <div className="flex h-full flex-col px-6 py-8">
            <div className="flex items-center gap-3 px-2 mb-12">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white font-black text-xl shadow-lg shadow-primary/20">
                <Zap size={20} fill="currentColor" />
              </div>
              <div>
                <h2 className="text-lg font-black tracking-tighter leading-none">SUPER ADMIN</h2>
                <p className="text-[9px] uppercase tracking-[0.3em] text-slate-500 font-black mt-1">Control Panel</p>
              </div>
            </div>

            <nav className="flex-1 space-y-1">
              {superAdminNav.map(({ label, path, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={path === "/super-admin"}
                  onClick={handleShortcutClick}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.15em] transition-all group ${
                      isActive
                        ? "bg-white text-slate-900 shadow-xl"
                        : "text-slate-500 hover:bg-white/5 hover:text-white"
                    }`
                  }
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              ))}
            </nav>

            <div className="mt-auto pt-8 border-t border-white/5">
              <div className="flex items-center gap-3 mb-6 px-2">
                <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center text-xs font-black border border-white/10">
                  {profile?.full_name?.charAt(0) || "A"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-black tracking-tight">{profile?.full_name || "Admin"}</p>
                  <p className="truncate text-[9px] text-slate-500 font-bold">{profile?.email}</p>
                </div>
              </div>
              <button
                onClick={() => void logout()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/10 py-3.5 text-[10px] font-black text-rose-500 uppercase tracking-widest transition-all hover:bg-rose-500 hover:text-white"
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-20 items-center justify-between bg-white px-6 lg:px-10 border-b border-slate-100">
             <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  <Menu size={20} />
                </button>
                <h1 className="text-[10px] sm:text-sm font-black text-slate-950 uppercase tracking-[0.2em]">{currentPage}</h1>
             </div>
             <div className="flex items-center gap-2 sm:gap-4">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="hidden sm:inline text-[10px] font-black text-slate-400 uppercase tracking-widest">System Operational</span>
             </div>
          </header>

          <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
