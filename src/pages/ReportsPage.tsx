import { useEffect, useState } from "react";
import { SectionCard } from "../components/ui/SectionCard";
import { StatCard } from "../components/ui/StatCard";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { RefreshCcw } from "lucide-react";
import { supabaseConfigured } from "../lib/supabase";
import { approveReturn } from "../services/returnService";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { Check, Clock, Calendar, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { getDailyReport, getRecentReturns, getRecentShifts, getReportCards, getFinancialReport } from "../services/reportsService";
import type { ReportCard, FinancialSummary } from "../services/reportsService";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { useTranslation } from "react-i18next";



export function ReportsPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { showToast } = useNotification();
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [dailyReport, setDailyReport] = useState<any>(null);
  const [recentShifts, setRecentShifts] = useState<any[]>([]);
  const [recentReturns, setRecentReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [lastRefreshed, setLastRefreshed] = useState<string>(new Date().toLocaleTimeString());

  // Financial Filter States
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [financialLoading, setFinancialLoading] = useState(false);


  const { run } = useAsyncAction();

  const loadReports = async (force = false) => {
    try {
      if (force) setLoading(true);
      const [cardsData, reportData, shiftsData, returnsData] = await Promise.all([
        getReportCards(force),
        getDailyReport(force),
        getRecentShifts(),
        getRecentReturns()
      ]);
  
      setReportCards(cardsData);
      setDailyReport(reportData);
      setRecentShifts(shiftsData);
      setRecentReturns(returnsData);
      setLastRefreshed(new Date().toLocaleTimeString());
      
      // Load financial summary for initial date range
      loadFinancialReport();
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFinancialReport = async () => {
    try {
      setFinancialLoading(true);
      const summary = await getFinancialReport(startDate, endDate);
      setFinancialSummary(summary);
    } catch (error) {
      console.error('Failed to load financial report:', error);
      showToast("error", "Failed to calculate profit data");
    } finally {
      setFinancialLoading(false);
    }
  };


  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    run(loadReports);
  }, [run]);

  useRealtimeSync({
    onSaleCreated: () => void run(loadReports),
    onPurchaseCreated: () => void run(loadReports),
    onCashRegisterChanged: () => void run(loadReports), // Shift updates
  });

  if (loading) {
    return (
      <div className="space-y-6">


        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">{t('reports.title')}</p>
          <h2 className="mt-1 text-3xl font-bold text-ink">{t('reports.title')}</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-slate-500">
            <p className="font-bold uppercase tracking-widest text-slate-400">{t('reports.status_label')}</p>
            <p>{t('reports.updated_at', { time: lastRefreshed })}</p>
          </div>
          <button 
            onClick={() => void loadReports(true)}
            className="rounded-2xl bg-white p-3 text-brand-600 shadow-soft transition hover:bg-brand-50"
            title={t('reports.refresh')}
          >
            <RefreshCcw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>



      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {reportCards.map((report) => (
          <StatCard 
            key={report.title} 
            {...report} 
            title={t(`reports.${report.title.toLowerCase().replace(/ /g, '_')}`)}
          />
        ))}
      </div>

      <SectionCard
        title={t('reports.finance.title')}
        subtitle={t('reports.finance.subtitle')}
      >
        <div className="mb-8 flex flex-wrap items-end gap-6 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{t('reports.finance.start_date')}</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{t('reports.finance.end_date')}</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <button 
            onClick={loadFinancialReport}
            disabled={financialLoading}
            className="rounded-2xl bg-slate-900 px-8 py-3.5 text-sm font-bold text-white shadow-xl transition hover:bg-black active:scale-95 disabled:opacity-50"
          >
            {financialLoading ? t('common.calculating') : t('reports.finance.apply')}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
           {[
             { label: t('reports.finance.sales'), value: financialSummary?.totalSales, icon: TrendingUp, color: "brand" },
             { label: t('reports.finance.cost'), value: financialSummary?.totalCost, icon: TrendingDown, color: "slate" },
             { label: t('reports.finance.gross'), value: financialSummary?.grossProfit, icon: DollarSign, color: "emerald" },
             { label: t('reports.finance.tax'), value: financialSummary?.taxCollected, icon: Clock, color: "amber" },
             { label: t('reports.finance.net'), value: financialSummary?.netIncome, icon: TrendingUp, color: "sky" },
           ].map((stat) => (
             <div key={stat.label} className="group relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm transition hover:shadow-soft">
               <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-${stat.color}-50 text-${stat.color}-600`}>
                 <stat.icon size={22} />
               </div>
               <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{stat.label}</p>
               <p className={`mt-2 text-xl font-black text-ink`}>
                 {Number(stat.value || 0).toLocaleString()} RWF
               </p>
               <div className={`absolute bottom-0 right-0 h-24 w-24 translate-x-12 translate-y-12 rounded-full bg-${stat.color}-50 opacity-20 transition group-hover:scale-150`} />
             </div>
           ))}
        </div>
      </SectionCard>


      <SectionCard
        title={t('reports.daily.title')}
        subtitle={t('reports.daily.subtitle')}
      >
        <div className="grid gap-4 md:grid-cols-4">
          {[
            [t('reports.daily.start'), dailyReport?.startTime || "09:00"],
            [t('reports.daily.end'), dailyReport?.endTime || "18:00"],
            [t('reports.daily.paid'), dailyReport?.paidSales || "$0.00"],
            [t('reports.daily.cashier'), dailyReport?.cashierName || t('reports.daily.no_activity')],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard
        title={t('reports.shifts.title')}
        subtitle={t('reports.shifts.subtitle')}
      >
        <div className="overflow-x-auto rounded-3xl border border-slate-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">{t('common.date')}</th>
                <th className="px-6 py-4 font-semibold">{t('reports.shifts.cashier')}</th>
                <th className="px-6 py-4 font-semibold">{t('reports.shifts.location')}</th>
                <th className="px-6 py-4 font-semibold">{t('reports.shifts.from')}</th>
                <th className="px-6 py-4 font-semibold">{t('reports.shifts.to')}</th>
                <th className="px-6 py-4 font-semibold text-right">{t('reports.shifts.opening')}</th>
                <th className="px-6 py-4 font-semibold text-right">{t('reports.shifts.cash_sales')}</th>
                <th className="px-6 py-4 font-semibold text-right">{t('reports.shifts.total_revenue')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentShifts.length > 0 ? recentShifts.map((shift) => (
                <tr key={shift.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-ink">
                    {new Date(shift.closed_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{shift.users?.full_name || t('common.unknown')}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      {shift.locations?.name || t('settings.staff.global_access')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(shift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(shift.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-500">
                    {Number(shift.opening_amount).toLocaleString()} RWF
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-emerald-600">
                    {Number(shift.closing_amount || 0).toLocaleString()} RWF
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-ink">
                    {Number(shift.total_sales || 0).toLocaleString()} RWF
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-slate-400">
                    {t('reports.shifts.no_records')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title={t('reports.returns.title')}
        subtitle={t('reports.returns.subtitle')}
      >
        <div className="overflow-x-auto rounded-3xl border border-slate-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-amber-50 uppercase tracking-wider text-amber-700">
              <tr>
                <th className="px-6 py-4 font-semibold text-xs">{t('common.date')}</th>
                <th className="px-6 py-4 font-semibold text-xs">{t('reports.returns.sale_num')}</th>
                <th className="px-6 py-4 font-semibold text-xs">{t('reports.returns.cashier')}</th>
                <th className="px-6 py-4 font-semibold text-xs">{t('reports.returns.reason')}</th>
                <th className="px-6 py-4 font-semibold text-xs">{t('reports.returns.method')}</th>
                <th className="px-6 py-4 font-semibold text-xs">{t('reports.returns.status')}</th>
                <th className="px-6 py-4 font-semibold text-xs text-right">{t('common.amount')}</th>
                {profile?.role === 'admin' && <th className="px-6 py-4 font-semibold text-xs text-right">{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentReturns.length > 0 ? recentReturns.map((ret) => (
                <tr key={ret.id} className="hover:bg-amber-50/30 transition-colors">
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(ret.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    <span className="ml-2 text-[10px] opacity-50">{new Date(ret.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </td>
                  <td className="px-6 py-4 font-bold text-ink">{ret.sales?.sale_number || "---"}</td>
                  <td className="px-6 py-4 text-slate-600">{ret.users?.full_name || t('common.unknown')}</td>
                  <td className="px-6 py-4">
                    <span className="capitalize text-slate-600">{ret.reason?.replace('_', ' ') || t('common.none')}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 uppercase">
                      {ret.refund_method}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      ret.status === 'completed' 
                        ? 'bg-emerald-50 text-emerald-600' 
                        : 'bg-amber-50 text-amber-600 animate-pulse'
                    }`}>
                      {ret.status === 'completed' ? <Check size={10} /> : <Clock size={10} />}
                      {ret.status === 'completed' ? t('reports.returns.approved') : t('reports.returns.pending')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-black text-amber-600">
                    {Number(ret.refund_amount).toLocaleString()} RWF
                  </td>
                  {profile?.role === 'admin' && (
                    <td className="px-6 py-4 text-right">
                      {ret.status !== 'completed' && (
                        <button 
                          onClick={async () => {
                            try {
                              await approveReturn(ret.id);
                              showToast("success", t('reports.returns.success_approved'));
                              loadReports(true);
                            } catch (e: any) {
                              showToast("error", t('reports.returns.error_failed') + e.message);
                            }
                          }}
                          className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition-all hover:bg-black hover:scale-105 active:scale-95"
                        >
                          {t('reports.returns.approve_btn')}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400 font-medium italic">
                    {t('reports.returns.no_records')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

