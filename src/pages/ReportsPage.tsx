import { useEffect, useState } from "react";
import { SectionCard } from "../components/ui/SectionCard";
import { StatCard } from "../components/ui/StatCard";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { RefreshCcw } from "lucide-react";
import { supabaseConfigured } from "../lib/supabase";
import { approveReturn } from "../services/returnService";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { Eye, X, Printer, Check, Clock, Calendar, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { getDailyReport, getRecentReturns, getRecentShifts, getReportCards, getFinancialReport, getAggregatedProductsSold, getDebtPaymentsReport, getShiftClosure } from "../services/reportsService";
import type { ReportCard, FinancialSummary } from "../services/reportsService";
import type { DayClosureRecord } from "../types/database";
import { formatCurrency } from "../lib/format";



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
  const [aggregatedProducts, setAggregatedProducts] = useState<any[]>([]);
  const [debtPayments, setDebtPayments] = useState<any[]>([]);
  const [financialLoading, setFinancialLoading] = useState(false);

  // Shift Detail States
  const [selectedShift, setSelectedShift] = useState<any>(null);
  const [shiftClosure, setShiftClosure] = useState<DayClosureRecord | null>(null);
  const [loadingShift, setLoadingShift] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [printShift, setPrintShift] = useState(false);


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
      const [summary, products, debts] = await Promise.all([
        getFinancialReport(startDate, endDate),
        getAggregatedProductsSold(startDate, endDate),
        getDebtPaymentsReport(startDate, endDate)
      ]);
      setFinancialSummary(summary);
      setAggregatedProducts(products);
      setDebtPayments(debts);
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

  const handleViewShift = async (shift: any) => {
    setSelectedShift(shift);
    setShowShiftModal(true);
    setLoadingShift(true);
    try {
      const closure = await getShiftClosure(shift.user_id, shift.location_id, shift.closed_at || shift.opened_at);
      setShiftClosure(closure);
    } catch (err) {
      console.error("Failed to load shift closure", err);
    } finally {
      setLoadingShift(false);
    }
  };

  const handlePrintShift = () => {
    setPrintShift(true);
    setTimeout(() => {
      window.print();
      setPrintShift(false);
    }, 300);
  };

  if (loading) {
    return (
      <div className="space-y-6">


        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between print:hidden">
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

      <div className="print:hidden space-y-6">
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

        <div className="grid gap-4 md:grid-cols-4">
           {[
             { label: t('reports.finance.sales'), value: financialSummary?.totalSales, icon: DollarSign, color: "brand" },
             { label: t('reports.finance.cost'), value: financialSummary?.totalCost, icon: TrendingDown, color: "slate" },
             { label: t('reports.finance.gross'), value: (financialSummary?.totalSales || 0) - (financialSummary?.totalCost || 0), icon: TrendingUp, color: "emerald" },
             { label: t('reports.finance.tax_collected'), value: financialSummary?.taxCollected, icon: Clock, color: "amber" },
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
                <th className="px-6 py-4 font-semibold text-right">{t('reports.shifts.grand_total')}</th>
                <th className="px-6 py-4 font-semibold text-right">{t('common.actions')}</th>
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
                  <td className="px-6 py-4 text-right font-bold text-ink">
                    {Number(shift.total_sales || 0).toLocaleString()} RWF
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleViewShift(shift)} className="p-2 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors">
                      <Eye size={16} />
                    </button>
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

      <SectionCard
        title={t('reports.debt_payments.title')}
        subtitle={t('reports.debt_payments.subtitle')}
      >
        <div className="overflow-x-auto rounded-3xl border border-slate-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-emerald-50 uppercase tracking-wider text-emerald-700">
              <tr>
                <th className="px-6 py-4 font-semibold text-xs">{t('reports.debt_payments.col_client')}</th>
                <th className="px-6 py-4 font-semibold text-xs text-right">{t('reports.debt_payments.col_amount')}</th>
                <th className="px-6 py-4 font-semibold text-xs">{t('reports.debt_payments.col_cashier')}</th>
                <th className="px-6 py-4 font-semibold text-xs">{t('reports.debt_payments.col_date')}</th>
                <th className="px-6 py-4 font-semibold text-xs">{t('reports.debt_payments.col_sale')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {debtPayments.length > 0 ? debtPayments.map((payment) => (
                <tr key={payment.id} className="hover:bg-emerald-50/30 transition-colors">
                  <td className="px-6 py-4 font-bold text-ink">{payment.clientName}</td>
                  <td className="px-6 py-4 text-right font-black text-emerald-600">
                    {Number(payment.amount).toLocaleString()} RWF
                  </td>
                  <td className="px-6 py-4 text-slate-600">{payment.cashierName}</td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(payment.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    <span className="ml-2 text-[10px] opacity-50">{new Date(payment.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </td>
                  <td className="px-6 py-4 text-xs font-mono text-slate-400">
                    {payment.saleNumber}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 font-medium italic">
                    {t('reports.debt_payments.no_records')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
      </div>

      {/* Printable Report Section */}
      <div className="hidden print:block space-y-8 bg-white p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-slate-900 mb-2">{t('reports.print_report.title')}</h1>
          <p className="text-lg text-slate-600">{t('reports.print_report.date_range', { start: startDate, end: endDate })}</p>
        </div>

        <div className="mb-10 p-6 border-2 border-slate-900 rounded-3xl">
          <h2 className="text-xl font-bold text-slate-800 mb-4 border-b-2 border-slate-900 pb-2 uppercase tracking-widest">{t('reports.finance.title')}</h2>
          <div className="grid grid-cols-2 gap-8">
            <div className="p-4 bg-slate-50 rounded-2xl">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t('reports.finance.sales')}</p>
              <p className="text-2xl font-black">{financialSummary?.totalSales.toLocaleString()} RWF</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t('reports.finance.cost')}</p>
              <p className="text-2xl font-black">{formatCurrency(financialSummary?.totalCost || 0)}</p>
            </div>
            <div className="p-5 border-2 border-emerald-600 rounded-2xl">
              <p className="text-xs font-bold text-emerald-600 uppercase mb-1">{t('reports.finance.gross')}</p>
              <p className="text-3xl font-black text-emerald-700">{formatCurrency((financialSummary?.totalSales || 0) - (financialSummary?.totalCost || 0))}</p>
            </div>
            <div className="p-5 bg-amber-50 border-2 border-amber-200 rounded-2xl">
              <p className="text-xs font-bold text-amber-600 uppercase mb-1">{t('reports.finance.tax_collected')}</p>
              <p className="text-3xl font-black text-amber-700">{formatCurrency(financialSummary?.taxCollected || 0)}</p>
            </div>
          </div>
        </div>

        <div className="mb-10">
          <h2 className="text-xl font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">{t('reports.print.products_sold_title')}</h2>
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-bold border border-slate-200">{t('reports.print.col_product')}</th>
                <th className="px-4 py-3 font-bold border border-slate-200 text-right">{t('reports.print.col_quantity')}</th>
                <th className="px-4 py-3 font-bold border border-slate-200 text-right">{t('reports.print.col_revenue')}</th>
              </tr>
            </thead>
            <tbody>
              {aggregatedProducts.length > 0 ? aggregatedProducts.map((prod, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="px-4 py-2 border border-slate-200">{prod.name}</td>
                  <td className="px-4 py-2 text-right border border-slate-200">{prod.quantity}</td>
                  <td className="px-4 py-2 text-right font-semibold border border-slate-200">{Number(prod.revenue).toLocaleString()} RWF</td>
                </tr>
              )) : (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500 italic border border-slate-200">{t('reports.print.no_data')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">{t('reports.print.debt_payments_title')}</h2>
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-bold border border-slate-200">{t('reports.print.col_client')}</th>
                <th className="px-4 py-3 font-bold border border-slate-200 text-right">{t('reports.print.col_amount')}</th>
                <th className="px-4 py-3 font-bold border border-slate-200">{t('reports.print.col_cashier')}</th>
                <th className="px-4 py-3 font-bold border border-slate-200">{t('reports.print.col_date')}</th>
              </tr>
            </thead>
            <tbody>
              {debtPayments.length > 0 ? debtPayments.map((payment, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="px-4 py-2 border border-slate-200">{payment.clientName}</td>
                  <td className="px-4 py-2 text-right font-semibold text-emerald-600 border border-slate-200">{Number(payment.amount).toLocaleString()} RWF</td>
                  <td className="px-4 py-2 border border-slate-200">{payment.cashierName}</td>
                  <td className="px-4 py-2 text-slate-500 border border-slate-200">
                    {new Date(payment.date).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500 italic border border-slate-200">{t('reports.print.no_data')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shift Detail Modal */}
      {showShiftModal && selectedShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-md" onClick={() => { setShowShiftModal(false); setSelectedShift(null); setShiftClosure(null); }}>
          <div className="w-full max-w-lg overflow-hidden rounded-[2.5rem] bg-white shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="bg-slate-900 p-8 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-white/60">
                    <Clock size={16} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">{t('reports.shifts.detail_title')}</span>
                  </div>
                  <h2 className="mt-2 text-3xl font-black">{selectedShift.users?.full_name}</h2>
                  <p className="text-sm opacity-70">{selectedShift.locations?.name}</p>
                </div>
                <button onClick={() => setShowShiftModal(false)} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-3xl bg-slate-50 p-5">
                   <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{t('reports.shifts.opened')}</p>
                   <p className="font-bold">{new Date(selectedShift.opened_at).toLocaleString()}</p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-5">
                   <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{t('reports.shifts.closed')}</p>
                   <p className="font-bold">{selectedShift.closed_at ? new Date(selectedShift.closed_at).toLocaleString() : t('common.active')}</p>
                </div>
              </div>

              <div>
                <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('reports.shifts.payment_breakdown')}</p>
                {loadingShift ? (
                  <div className="py-8 text-center text-slate-400">{t('common.loading')}</div>
                ) : shiftClosure ? (
                  <div className="space-y-2">
                    {[
                      { label: t('sales.returns.methods.cash'), value: shiftClosure.cash_amount, color: 'emerald' },
                      { label: t('sales.returns.methods.momo'), value: shiftClosure.momo_amount, color: 'amber' },
                      { label: t('sales.returns.methods.bank'), value: shiftClosure.bank_amount, color: 'sky' },
                      { label: t('sales.payments.methods.card'), value: shiftClosure.card_amount, color: 'violet' },
                      { label: t('sales.returns.methods.store_credit'), value: shiftClosure.credit_amount, color: 'rose' },
                    ].map((m) => (
                      <div key={m.label} className="flex items-center justify-between rounded-2xl bg-slate-50 px-5 py-3 transition hover:bg-slate-100">
                        <div className="flex items-center gap-3">
                          <div className={`h-2 w-2 rounded-full bg-${m.color}-500`} />
                          <span className="text-sm font-semibold text-slate-700">{m.label}</span>
                        </div>
                        <span className="font-bold text-ink">{formatCurrency(Number(m.value || 0))}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between rounded-2xl bg-slate-900 px-5 py-4 mt-4 text-white">
                       <span className="font-bold uppercase tracking-wider text-xs">{t('reports.shifts.grand_total')}</span>
                       <span className="text-xl font-black">{formatCurrency(Number(shiftClosure.total_amount || 0))}</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-400 italic rounded-3xl border-2 border-dashed border-slate-100">
                    {t('reports.shifts.no_closure_data')}
                  </div>
                )}
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 flex gap-4">
              <button onClick={() => setShowShiftModal(false)} className="flex-1 rounded-2xl py-4 font-bold text-slate-400 hover:bg-slate-50 transition">
                {t('common.close')}
              </button>
              <button onClick={handlePrintShift} className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 font-bold text-white shadow-xl hover:bg-black transition active:scale-95">
                <Printer size={18} /> {t('common.print')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Shift Summary Portal */}
      {printShift && selectedShift && shiftClosure && createPortal(
        <div className="print-doc p-10 bg-white min-h-screen font-sans">
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body > #root { display: none !important; }
              body { margin: 0 !important; padding: 0 !important; background: white !important; }
              .print-doc { display: block !important; }
              @page { size: A4; margin: 20mm; }
            }
          `}} />
          <div className="flex justify-between border-b-2 border-slate-900 pb-4 mb-8">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-widest">{t('reports.shifts.print_title')}</h1>
              <p className="text-slate-500">{t('reports.shifts.location')}: {selectedShift.locations?.name}</p>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold">{t('reports.shifts.cashier')}: {selectedShift.users?.full_name}</h2>
              <p className="text-slate-500">{new Date().toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-8">
            <div className="p-4 bg-slate-50 rounded-xl">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.shifts.opened')}</p>
              <p className="font-bold">{new Date(selectedShift.opened_at).toLocaleString()}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.shifts.closed')}</p>
              <p className="font-bold">{selectedShift.closed_at ? new Date(selectedShift.closed_at).toLocaleString() : 'N/A'}</p>
            </div>
          </div>

          <h3 className="text-lg font-bold border-b border-slate-200 pb-2 mb-4 uppercase tracking-wider">{t('reports.shifts.payment_breakdown')}</h3>
          <table className="w-full mb-8">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="p-3">{t('reports.shifts.method')}</th>
                <th className="p-3 text-right">{t('reports.debt_payments.col_amount')}</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: t('sales.returns.methods.cash'), value: shiftClosure.cash_amount },
                { label: t('sales.returns.methods.momo'), value: shiftClosure.momo_amount },
                { label: t('sales.returns.methods.bank'), value: shiftClosure.bank_amount },
                { label: t('sales.payments.methods.card'), value: shiftClosure.card_amount },
                { label: t('sales.returns.methods.store_credit'), value: shiftClosure.credit_amount },
              ].map(m => (
                <tr key={m.label} className="border-b border-slate-100">
                  <td className="p-3 font-medium">{m.label}</td>
                  <td className="p-3 text-right font-bold">{Number(m.value || 0).toLocaleString()} RWF</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-black">
                <td className="p-4 uppercase">{t('reports.shifts.grand_total')}</td>
                <td className="p-4 text-right text-xl">{Number(shiftClosure.total_amount || 0).toLocaleString()} RWF</td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-16 pt-8 border-t border-slate-200 text-center text-slate-400 text-xs">
            <p>{t('reports.shifts.footer_generated')} {new Date().toLocaleString()}</p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

