import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingPOS } from "../components/ui/LoadingPOS";
import { Navigate } from "react-router-dom";
import { SectionCard } from "../components/ui/SectionCard";
import { StatCard } from "../components/ui/StatCard";
import { useAuth } from "../context/AuthContext";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { RefreshCcw, ShoppingBag, TrendingUp, Wallet, Users, Package, AlertTriangle } from "lucide-react";
import { getDashboardStats, getRecentTransactions, getSalesTrend, getUnpaidCustomers, getUnpaidSuppliers, type DashboardStat, type RecentTransaction, type SalesTrendItem, type UnpaidItem } from "../services/dashboardService";
import { getVatSummary, type VatSummary } from "../services/vatService";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { useTranslation } from "react-i18next";
import { SubscriptionStatusBanner } from "../components/ui/SubscriptionStatusBanner";

export function DashboardPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { can, profile, hasRole } = useAuth();
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [salesTrend, setSalesTrend] = useState<SalesTrendItem[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [unpaidCustomers, setUnpaidCustomers] = useState<UnpaidItem[]>([]);
  const [unpaidSuppliers, setUnpaidSuppliers] = useState<UnpaidItem[]>([]);
  const [vatSummary, setVatSummary] = useState<VatSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>(new Date().toLocaleTimeString());

  const { run } = useAsyncAction();

  const loadDashboardData = async (force = false) => {
    try {
      if (force) setLoading(true);
      const bizId = profile?.business_id;
      const [statsData, trendData, transactionsData, customersData, suppliersData, vatData] = await Promise.all([
        getDashboardStats(force, bizId),
        getSalesTrend(bizId),
        getRecentTransactions(bizId),
        getUnpaidCustomers(bizId),
        getUnpaidSuppliers(bizId),
        getVatSummary()
      ]);

      setStats(statsData);
      setSalesTrend(trendData);
      setRecentTransactions(transactionsData);
      setUnpaidCustomers(customersData);
      setUnpaidSuppliers(suppliersData);
      setVatSummary(vatData);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run(loadDashboardData);
  }, [run]);

  // Real-time synchronization for Dashboard
  useRealtimeSync({
    onSaleCreated: () => {
      // Refresh without full page loading state for a smoother UX
      void loadDashboardData(false);
    },
    onPurchaseCreated: () => {
      void loadDashboardData(false);
    },
    onStockChanged: () => {
      void loadDashboardData(false);
    },
    onCustomerChanged: () => {
      void loadDashboardData(false);
    },
    onSupplierChanged: () => {
      void loadDashboardData(false);
    }
  });

  const maxValue = salesTrend.length > 0 ? Math.max(...salesTrend.map((item) => item.value)) : 1;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-[2rem] bg-slate-100/50 border border-slate-100"></div>
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-[2rem] bg-slate-50 border border-slate-100"></div>
      </div>
    );
  }

  if (!can("Dashboard", "view") && !can("Reports", "view") && !hasRole("cashier", "manager")) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 rounded-full bg-rose-50 p-6 text-rose-600">
          <RefreshCcw size={48} />
        </div>
        <h2 className="text-2xl font-bold text-ink">{t('common.error')}</h2>
        <p className="mt-2 text-slate-500">You do not have permission to view the performance dashboard.</p>
        <button 
          onClick={() => window.history.back()}
          className="mt-6 rounded-2xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          {t('common.actions')}
        </button>
      </div>

    );
  }

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('dashboard.greeting_morning');
    if (hour < 17) return t('dashboard.greeting_afternoon');
    return t('dashboard.greeting_evening');
  };


  return (
    <div className="space-y-4">
      <SubscriptionStatusBanner />
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-600 opacity-80">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h2 className="text-2xl font-black text-ink">
            {greeting()}, {profile?.full_name?.split(" ")[0] || "Team Member"}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{t('dashboard.sync_status')}</p>
            <p className="text-[10px] font-bold text-slate-500">{lastRefreshed}</p>
          </div>
          <button 
            onClick={() => void loadDashboardData(true)}
            className="rounded-xl bg-white p-2 text-brand-600 shadow-sm ring-1 ring-slate-100 transition hover:bg-brand-50"
            title={t('dashboard.refresh')}
          >
            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => {
          const title = stat.title;
          let icon = ShoppingBag;
          let tone: "sky" | "emerald" | "amber" | "rose" | "indigo" | "orange" = "sky";
          let translatedTitle = title;

          if (title.includes("Sales")) {
            icon = ShoppingBag;
            tone = "sky";
            translatedTitle = t('dashboard.stats.sales');
          } else if (title.includes("Revenue")) {
            icon = TrendingUp;
            tone = "emerald";
            translatedTitle = t('dashboard.stats.revenue');
          } else if (title.includes("Suppliers")) {
            icon = Wallet;
            tone = "rose";
            translatedTitle = t('dashboard.stats.suppliers');
          } else if (title.includes("Customers")) {
            icon = Users;
            tone = "amber";
            translatedTitle = t('dashboard.stats.customers');
          } else if (title.includes("Sold")) {
            icon = Package;
            tone = "indigo";
            translatedTitle = t('dashboard.stats.sold');
          } else if (title.includes("Alerts")) {
            icon = AlertTriangle;
            tone = "orange";
            translatedTitle = t('dashboard.stats.alerts');
          }

          return <StatCard key={title} {...stat} title={translatedTitle} icon={icon} tone={tone} />;
        })}

      </div>

      {vatSummary && !vatSummary.disabled ? (
        <SectionCard
          title="VAT Summary"
          subtitle={`Current reporting period: ${vatSummary.periodLabel}`}
        >
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: "Output VAT", value: vatSummary.outputVat, tone: "bg-sky-50 text-sky-700", title: "VAT collected from customers on sales." },
              { label: "Input VAT", value: vatSummary.inputVat, tone: "bg-emerald-50 text-emerald-700", title: "VAT paid on eligible purchases from VAT-registered suppliers." },
              {
                label: vatSummary.vatCredit > 0 ? "VAT Credit" : "VAT Payable",
                value: vatSummary.vatCredit > 0 ? vatSummary.vatCredit : vatSummary.vatPayable,
                tone: vatSummary.vatCredit > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                title: "Output VAT minus Input VAT. Payable never goes below zero.",
              },
              { label: "Status", value: 0, text: vatSummary.status, tone: vatSummary.vatCredit > 0 ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700", title: "Shows whether this period has VAT payable or credit to carry forward." },
            ].map((item) => (
              <div key={item.label} className={`rounded-3xl p-5 ${item.tone}`} title={item.title}>
                <p className="text-xs font-black uppercase tracking-widest opacity-70">{item.label}</p>
                <p className="mt-3 text-2xl font-black">{item.text || `${Math.round(item.value).toLocaleString()} RWF`}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : vatSummary?.disabled ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-slate-600">
          <p className="text-xs font-black uppercase tracking-widest">VAT Disabled</p>
          <p className="mt-2 text-sm">VAT calculations and tax-to-pay widgets are hidden because this business is not marked as VAT registered.</p>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard
          title={t('dashboard.weekly_trend')}
          subtitle={t('dashboard.weekly_subtitle')}
        >
          <div className="flex h-72 items-end gap-4">
            {salesTrend.map((item) => (
              <div key={item.label} className="flex flex-1 flex-col items-center gap-3">
                <div className="flex h-56 w-full items-end rounded-full bg-slate-100 p-2">
                  <div
                    className="w-full rounded-full bg-gradient-to-t from-brand-600 to-sky-400"
                    style={{ height: `${maxValue > 0 ? (item.value / maxValue) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-slate-500">{item.label}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title={t('dashboard.recent_tx')}
          subtitle={t('dashboard.recent_subtitle')}
        >
          <div className="space-y-4">
            {recentTransactions.length > 0 ? recentTransactions.slice(0, 3).map((transaction) => (

              <div
                key={transaction.id}
                className="rounded-2xl border border-slate-100 p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-ink">{transaction.id}</p>
                    <p className="text-sm text-slate-500">{transaction.customer}</p>
                  </div>
                  <p className="text-sm font-semibold text-brand-600">{transaction.total}</p>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
                  <span>{transaction.cashier}</span>
                  <span>{transaction.time}</span>
                </div>
              </div>
            )) : (
              <p className="py-10 text-center text-sm text-slate-400">{t('dashboard.no_recent')}</p>
            )}
          </div>
          <button onClick={() => navigate("/sales")} className="mt-4 w-full rounded-xl border border-brand-100 py-2 text-xs font-bold text-brand-600 hover:bg-brand-50">View all sales</button>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title={t('dashboard.unpaid_customers')}
          subtitle="Customers with outstanding sales balances"
        >
          <div className="space-y-4">
            {unpaidCustomers.length > 0 ? unpaidCustomers.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl bg-amber-50 p-4 border border-amber-100">
                <div>
                  <p className="font-semibold text-amber-900">{item.name}</p>
                  <p className="text-xs text-amber-700">{t('dashboard.due_since')} {item.date}</p>
                </div>
                <p className="font-bold text-amber-600">{item.amount}</p>
              </div>
            )) : (
              <p className="py-6 text-center text-sm text-slate-400">No outstanding customer debt</p>
            )}
          </div>
          <button onClick={() => navigate("/customers")} className="mt-4 w-full rounded-xl border border-amber-100 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50">View all customers</button>
        </SectionCard>

        <SectionCard
          title={t('dashboard.unpaid_suppliers')}
          subtitle="Outstanding balances owed to suppliers"
        >
          <div className="space-y-4">
            {unpaidSuppliers.length > 0 ? unpaidSuppliers.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl bg-rose-50 p-4 border border-rose-100">
                <div>
                  <p className="font-semibold text-rose-900">{item.name}</p>
                  <p className="text-xs text-rose-700">{t('dashboard.owed_from')} {item.date}</p>
                </div>
                <p className="font-bold text-rose-600">{item.amount}</p>
              </div>
            )) : (
              <p className="py-6 text-center text-sm text-slate-400">No outstanding supplier debts</p>
            )}
          </div>
          <button onClick={() => navigate("/suppliers")} className="mt-4 w-full rounded-xl border border-rose-100 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">View all suppliers</button>
        </SectionCard>
      </div>

    </div>
  );
}
