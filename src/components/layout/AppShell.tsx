import { Bell, LogOut, Search, Menu, X, Languages } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { navItems } from "../../data/mockData";
import { useAuth } from "../../context/AuthContext";
import { useNotification } from "../../context/NotificationContext";
import { useSettings } from "../../hooks/useSettings";
import { useTranslation } from "react-i18next";
import { getBusinessReminders, type BusinessReminder } from "../../services/reminderService";


export function AppShell() {
  const { i18n, t } = useTranslation();
  const location = useLocation();
  const { authConfigured, hasRole, logout, profile, can, session } = useAuth();
  const { showToast } = useNotification();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [reminders, setReminders] = useState<BusinessReminder[]>([]);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const isPosRoute = location.pathname === "/pos";
  const currentPage =
    navItems.find((item) => item.path === location.pathname)?.label ?? t('menu.dashboard');


  const changeLanguage = async (lng: string) => {
    i18n.changeLanguage(lng);
    setIsMenuOpen(false);
    
    // Persist to DB if user is logged in
    if (profile?.id) {
      try {
        const { updateUserLanguage } = await import("../../services/settingsService");
        await updateUserLanguage(profile.id, lng);
        
        // Update local cache to avoid flicker on reload
        const cached = localStorage.getItem('cached_user_profile');
        if (cached) {
          const parsed = JSON.parse(cached);
          parsed.language = lng;
          localStorage.setItem('cached_user_profile', JSON.stringify(parsed));
        }
      } catch (err) {
        console.error("Failed to persist language preference:", err);
      }
    }
  };

  const { settings } = useSettings();

  const visibleNavItems = navItems.filter((item) => {
    if (item.label === "VAT Report" && (settings as any)?.vat_registration_status !== "registered") {
      return false;
    }

    if (!authConfigured) return true;
    
    // 1. Admins have omnipotent access
    if (profile?.role === "admin" || profile?.role === "super_admin") return true;

    // 2. Check for explicit permission override
    // If the user has a permission record for this module, it is authoritative
    return can(item.label, "view");
  });

  const navLabel = (label: string) => label === "VAT Report" ? "VAT Report" : t(`menu.${label.toLowerCase()}`);

  useEffect(() => {
    if (!authConfigured || !profile || isPosRoute || profile.role === "super_admin") {
      setReminders([]);
      return;
    }

    let active = true;

    async function loadReminders() {
      try {
        const nextReminders = await getBusinessReminders();
        if (!active) return;

        setReminders(nextReminders);

        nextReminders.slice(0, 3).forEach((reminder) => {
          const storageKey = `reminder_seen_${reminder.id}`;
          if (!sessionStorage.getItem(storageKey)) {
            showToast(reminder.severity, reminder.message);
            sessionStorage.setItem(storageKey, "1");
          }
        });
      } catch (err) {
        console.error("Failed to load business reminders:", err);
      }
    }

    void loadReminders();
    const interval = window.setInterval(loadReminders, 5 * 60 * 1000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [authConfigured, isPosRoute, profile?.id, profile?.role, showToast]);

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
            {settings?.shop_name || "UMUCURUZI POS"}
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
          <div className="absolute inset-y-0 left-0 w-[280px] bg-slate-950 p-6 shadow-2xl animate-in slide-in-from-left duration-300 flex flex-col">
            <div className="flex items-center justify-between mb-8 shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-brand-500 flex items-center justify-center text-white font-bold text-xs">
                  {settings?.shop_name?.charAt(0) || "B"}
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-white">{t('menu.dashboard')}</span>
              </div>

              <button onClick={() => setIsMenuOpen(false)} className="text-slate-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <nav className="space-y-1 overflow-y-auto flex-1 pr-2 custom-scrollbar">
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
                  {navLabel(label)}
                </NavLink>

              ))}
            </nav>

            <div className="mt-6 pt-6 border-t border-white/10 shrink-0">
              {/* Mobile Language Switcher */}
              <div className="mb-6 flex gap-2">
                {['en', 'rw', 'fr'].map((lng) => (
                  <button
                    key={lng}
                    onClick={() => changeLanguage(lng)}
                    className={`flex-1 rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition ${
                      i18n.language === lng ? 'bg-white text-slate-950' : 'bg-white/5 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    {lng}
                  </button>
                ))}
              </div>

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
                {t('menu.sign_out')}
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
              {settings?.shop_name || "UMUCURUZI POS"}
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
                {navLabel(label)}
              </NavLink>

            ))}
          </nav>

          <div className="mt-auto rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3 text-slate-400">
                <Languages size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest">{t('menu.language')}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => changeLanguage('en')}
                  className={`rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition ${
                    i18n.language === 'en' ? 'bg-white text-slate-950' : 'bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => changeLanguage('rw')}
                  className={`rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition ${
                    i18n.language === 'rw' ? 'bg-white text-slate-950' : 'bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  RW
                </button>
                <button
                  onClick={() => changeLanguage('fr')}
                  className={`rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition ${
                    i18n.language === 'fr' ? 'bg-white text-slate-950' : 'bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  FR
                </button>
              </div>
            </div>

            <p className="text-sm font-semibold">{t('menu.role')}</p>

            <p className="mt-2 text-2xl font-bold uppercase tracking-tight">
              {profile?.role 
                ? profile.role
                : session 
                  ? t('menu.profile_missing') 
                  : t('menu.demo_mode')}
            </p>
            <p className="mt-2 text-sm text-slate-300">
              {profile?.full_name ?? (session ? session.user.email : t('menu.connect_auth'))}
            </p>
            {authConfigured ? (
              <button
                onClick={() => void logout()}
                 className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <LogOut size={16} />
                {t('menu.sign_out')}
              </button>

            ) : null}
          </div>
        </aside>

        <main className="flex-1 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{currentPage}</p>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setRemindersOpen((open) => !open)}
                className="relative rounded-2xl border border-slate-200 bg-white p-3 text-slate-600 shadow-soft transition hover:bg-slate-50"
                title="Business reminders"
              >
                <Bell size={18} />
                {reminders.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
                    {reminders.length}
                  </span>
                )}
              </button>

              {remindersOpen && (
                <div className="absolute right-0 top-14 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Reminders</p>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {reminders.length > 0 ? reminders.map((reminder) => (
                      <div key={reminder.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
                        <p className={`text-sm font-black ${
                          reminder.severity === "error" ? "text-rose-700" :
                          reminder.severity === "warning" ? "text-amber-700" :
                          "text-sky-700"
                        }`}>
                          {reminder.title}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600">{reminder.message}</p>
                      </div>
                    )) : (
                      <p className="px-4 py-8 text-center text-sm font-medium text-slate-400">No reminders right now.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <Outlet />
        </main>
      </div>
    </div>
  );
}
