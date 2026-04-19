import { useEffect, useState } from "react";
import { SectionCard } from "../components/ui/SectionCard";
import { StatCard } from "../components/ui/StatCard";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { RefreshCcw } from "lucide-react";
import { supabaseConfigured } from "../lib/supabase";
import { getDailyReport, getRecentReturns, getRecentShifts, getReportCards, type ReportCard } from "../services/reportsService";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { approveReturn } from "../services/returnService";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { Check, Clock } from "lucide-react";

export function ReportsPage() {
  const { profile } = useAuth();
  const { showToast } = useNotification();
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [dailyReport, setDailyReport] = useState<any>(null);
  const [recentShifts, setRecentShifts] = useState<any[]>([]);
  const [recentReturns, setRecentReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [lastRefreshed, setLastRefreshed] = useState<string>(new Date().toLocaleTimeString());

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
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
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
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">Analytics</p>
          <h2 className="mt-1 text-3xl font-bold text-ink">Business Reports</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-slate-500">
            <p className="font-bold uppercase tracking-widest text-slate-400">Status</p>
            <p>Updated at {lastRefreshed}</p>
          </div>
          <button 
            onClick={() => void loadReports(true)}
            className="rounded-2xl bg-white p-3 text-brand-600 shadow-soft transition hover:bg-brand-50"
            title="Refresh reports"
          >
            <RefreshCcw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>



      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {reportCards.map((report) => (
          <StatCard key={report.title} {...report} />
        ))}
      </div>

      <SectionCard
        title="Daily sales report"
        subtitle="Operational summary for current trading window"
      >
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Start Time", dailyReport?.startTime || "09:00"],
            ["End Time", dailyReport?.endTime || "18:00"],
            ["Paid Sales", dailyReport?.paidSales || "$0.00"],
            ["Cashier Name", dailyReport?.cashierName || "No activity"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard
        title="Recent shift history"
        subtitle="Detailed logs of closed cashier shifts"
      >
        <div className="overflow-x-auto rounded-3xl border border-slate-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Cashier</th>
                <th className="px-6 py-4 font-semibold">Location</th>
                <th className="px-6 py-4 font-semibold">From</th>
                <th className="px-6 py-4 font-semibold">To</th>
                <th className="px-6 py-4 font-semibold text-right">Opening</th>
                <th className="px-6 py-4 font-semibold text-right">Cash Sales</th>
                <th className="px-6 py-4 font-semibold text-right">Total Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentShifts.length > 0 ? recentShifts.map((shift) => (
                <tr key={shift.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-ink">
                    {new Date(shift.closed_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{shift.users?.full_name || "Unknown"}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      {shift.locations?.name || "Global"}
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
                    No recent shift records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Recent returns history"
        subtitle="Last 10 processed refunds and item returns"
      >
        <div className="overflow-x-auto rounded-3xl border border-slate-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-amber-50 uppercase tracking-wider text-amber-700">
              <tr>
                <th className="px-6 py-4 font-semibold text-xs">Date</th>
                <th className="px-6 py-4 font-semibold text-xs">Sale #</th>
                <th className="px-6 py-4 font-semibold text-xs">Cashier</th>
                <th className="px-6 py-4 font-semibold text-xs">Reason</th>
                <th className="px-6 py-4 font-semibold text-xs">Method</th>
                <th className="px-6 py-4 font-semibold text-xs">Status</th>
                <th className="px-6 py-4 font-semibold text-xs text-right">Amount</th>
                {profile?.role === 'admin' && <th className="px-6 py-4 font-semibold text-xs text-right">Action</th>}
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
                  <td className="px-6 py-4 text-slate-600">{ret.users?.full_name || "Unknown"}</td>
                  <td className="px-6 py-4">
                    <span className="capitalize text-slate-600">{ret.reason?.replace('_', ' ') || "None"}</span>
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
                      {ret.status === 'completed' ? 'Approved' : 'Pending'}
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
                              showToast("success", "Refund approved and restocked!");
                              loadReports(true);
                            } catch (e: any) {
                              showToast("error", "Approval failed: " + e.message);
                            }
                          }}
                          className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition-all hover:bg-black hover:scale-105 active:scale-95"
                        >
                          Approve
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400 font-medium italic">
                    No recent returns recorded.
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

