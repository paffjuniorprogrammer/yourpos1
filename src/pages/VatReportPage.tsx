import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Printer, RefreshCcw } from "lucide-react";
import { SectionCard } from "../components/ui/SectionCard";
import { formatCurrency } from "../lib/format";
import { getVatHistory, getVatSummary, type VatHistoryRow, type VatSummary } from "../services/vatService";

function money(value: number) {
  return formatCurrency(Math.round(value || 0));
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function VatReportPage() {
  const [summary, setSummary] = useState<VatSummary | null>(null);
  const [history, setHistory] = useState<VatHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReport = async () => {
    setLoading(true);
    try {
      const [currentSummary, rows] = await Promise.all([
        getVatSummary(),
        getVatHistory(6),
      ]);
      setSummary(currentSummary);
      setHistory(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReport();
  }, []);

  const csv = useMemo(() => {
    const headers = ["Month", "Sales", "Purchases", "Output VAT", "Input VAT", "VAT Payable", "VAT Credit", "Status"];
    const rows = history.map((row) => [
      row.month,
      row.salesIncludingVat,
      row.purchasesIncludingVat,
      row.outputVat,
      row.inputVat,
      row.vatPayable,
      row.vatCredit,
      row.status,
    ]);
    return [headers, ...rows].map((row) => row.join(",")).join("\n");
  }, [history]);

  if (loading || !summary) {
    return <div className="h-48 animate-pulse rounded-3xl bg-slate-100" />;
  }

  if (summary.disabled) {
    return (
      <div className="space-y-6">
        <SectionCard title="VAT Report" subtitle="VAT reports are hidden when the business is not VAT registered.">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-slate-700">
            <p className="text-xs font-black uppercase tracking-widest">VAT Disabled</p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed">
              Go to Settings, Tax Settings and mark the business as VAT Registered to enable Output VAT, Input VAT, VAT Payable, and VAT Credit reporting.
            </p>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">Rwanda VAT</p>
          <h2 className="mt-1 text-3xl font-bold text-ink">VAT Report</h2>
          <p className="mt-1 text-sm text-slate-500">Reporting Period: {summary.periodLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void loadReport()} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-soft">
            <RefreshCcw size={16} /> Refresh
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-soft">
            <Printer size={16} /> Print
          </button>
          <button onClick={() => downloadText("vat-report.csv", csv, "text/csv")} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-soft">
            <Download size={16} /> Excel
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-soft">
            <FileText size={16} /> PDF
          </button>
        </div>
      </div>

      <SectionCard title="Business Information" subtitle="Shown on the VAT report for audit reference.">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Business Name", summary.businessInfo.businessName || "Not configured"],
            ["TIN Number", summary.businessInfo.tinNumber || "Not configured"],
            ["VAT Registration", summary.businessInfo.vatRegistrationNumber || "Not configured"],
            ["EBM Serial", summary.businessInfo.ebmSerialNumber || "Optional"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
              <p className="mt-2 font-bold text-ink">{value}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Sales Summary" subtitle="Output VAT is VAT collected from customers on sales.">
          <div className="space-y-3">
            <SummaryRow label="Total Sales Before VAT" value={summary.salesBeforeVat} />
            <SummaryRow label="Output VAT" value={summary.outputVat} tone="text-sky-700" />
            <SummaryRow label="Total Sales Including VAT" value={summary.salesIncludingVat} strong />
          </div>
        </SectionCard>
        <SectionCard title="Purchase Summary" subtitle="Input VAT is VAT paid on eligible supplier purchases.">
          <div className="space-y-3">
            <SummaryRow label="Total Purchases Before VAT" value={summary.purchasesBeforeVat} />
            <SummaryRow label="Input VAT" value={summary.inputVat} tone="text-emerald-700" />
            <SummaryRow label="Total Purchases Including VAT" value={summary.purchasesIncludingVat} strong />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="VAT Calculation" subtitle="VAT Payable = Output VAT - Input VAT. Negative payable is never shown.">
        <div className="grid gap-4 md:grid-cols-4">
          <CalcBox label="Output VAT" value={summary.outputVat} tone="bg-sky-50 text-sky-700" />
          <CalcBox label="Minus Input VAT" value={summary.inputVat} tone="bg-emerald-50 text-emerald-700" />
          <CalcBox label={summary.vatCredit > 0 ? "VAT Credit" : "VAT Payable"} value={summary.vatCredit > 0 ? summary.vatCredit : summary.vatPayable} tone={summary.vatCredit > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"} />
          <div className="rounded-3xl bg-orange-50 p-5 text-orange-700">
            <p className="text-xs font-black uppercase tracking-widest opacity-70">Status</p>
            <p className="mt-3 text-xl font-black">{summary.status}</p>
            {summary.vatCredit > 0 ? <p className="mt-1 text-xs font-bold">Carry Forward to Next Month</p> : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Report History" subtitle="Previous periods are recalculated from sales and purchase records.">
        <div className="overflow-x-auto rounded-3xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-white">
              <tr>
                {["Month", "Sales", "Purchases", "Output VAT", "Input VAT", "VAT Payable", "VAT Credit", "Status"].map((header) => (
                  <th key={header} className="px-5 py-4">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {history.map((row) => (
                <tr key={row.month}>
                  <td className="px-5 py-4 font-bold text-ink">{row.month}</td>
                  <td className="px-5 py-4">{money(row.salesIncludingVat)}</td>
                  <td className="px-5 py-4">{money(row.purchasesIncludingVat)}</td>
                  <td className="px-5 py-4 text-sky-700">{money(row.outputVat)}</td>
                  <td className="px-5 py-4 text-emerald-700">{money(row.inputVat)}</td>
                  <td className="px-5 py-4 text-rose-700">{money(row.vatPayable)}</td>
                  <td className="px-5 py-4 text-emerald-700">{money(row.vatCredit)}</td>
                  <td className="px-5 py-4 font-bold">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function SummaryRow({ label, value, tone = "text-ink", strong = false }: { label: string; value: number; tone?: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-2xl bg-slate-50 px-5 py-4 ${strong ? "border border-slate-200" : ""}`}>
      <span className="text-sm font-bold text-slate-500">{label}</span>
      <span className={`text-lg font-black ${tone}`}>{money(value)}</span>
    </div>
  );
}

function CalcBox({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-3xl p-5 ${tone}`}>
      <p className="text-xs font-black uppercase tracking-widest opacity-70">{label}</p>
      <p className="mt-3 text-2xl font-black">{money(value)}</p>
    </div>
  );
}
