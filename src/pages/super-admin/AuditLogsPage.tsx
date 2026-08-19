import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { 
  History, 
  Search, 
  Filter, 
  ArrowLeftRight, 
  Plus, 
  Trash2, 
  Edit3,
  Download,
  Building2,
  User,
  Clock
} from "lucide-react";
import { superAdminService } from "../../services/superAdminService";
import { LoadingPOS } from "../../components/ui/LoadingPOS";

export function AuditLogsPage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      setLoading(true);
      const data = await superAdminService.getGlobalAuditLogs(100);
      setLogs(data);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = logs.filter(log => 
    String(log.entity_type || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(log.action || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(log.business_name || log.business?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(log.actor_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActionIcon = (action: string) => {
    switch (action.toLowerCase()) {
      case 'insert': return <Plus size={16} className="text-success" />;
      case 'update': return <Edit3 size={16} className="text-warning" />;
      case 'delete': return <Trash2 size={16} className="text-error" />;
      default: return <ArrowLeftRight size={16} />;
    }
  };

  if (loading) return <LoadingPOS />;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{t('super_admin.audit_logs.title')}</h1>
          <p className="text-slate-500 font-medium">{t('super_admin.audit_logs.subtitle')}</p>
        </div>
        <button className="flex items-center gap-2 rounded-2xl bg-white border border-slate-200 px-6 py-4 font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 active:scale-95">
          <Download size={20} />
          {t('super_admin.audit_logs.export_btn')}
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text"
            placeholder={t('super_admin.audit_logs.search_placeholder')}
            className="w-full rounded-2xl border-none bg-white py-4 pl-12 pr-4 shadow-sm outline-none ring-primary/20 transition-all focus:ring-4 placeholder:text-slate-400 font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 rounded-2xl bg-white border border-slate-200 px-6 py-4 font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50">
          <Filter size={20} />
          {t('super_admin.audit_logs.all_tables')}
        </button>
      </div>

      <div className="overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase tracking-widest text-slate-400">
                <th className="px-8 py-6">{t('super_admin.audit_logs.table.event')}</th>
                <th className="px-8 py-6">{t('super_admin.audit_logs.table.business')}</th>
                <th className="px-8 py-6">{t('super_admin.audit_logs.table.user')}</th>
                <th className="px-8 py-6">{t('super_admin.audit_logs.table.time')}</th>
                <th className="px-8 py-6 text-right">{t('super_admin.audit_logs.table.details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((log) => (
                <tr key={log.id} className="group transition-colors hover:bg-slate-50/50">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100`}>
                        {getActionIcon(log.action)}
                      </div>
                      <div>
                        <div className="text-sm font-black capitalize text-slate-900">{log.action}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{log.entity_type}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                       <Building2 size={14} className="text-slate-400" />
                       <span className="text-sm font-bold text-slate-600">{log.business_name || log.business?.name || t('super_admin.audit_logs.system')}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                       <User size={14} className="text-slate-400" />
                       <div className="overflow-hidden">
                          <div className="text-sm font-bold text-slate-600 truncate">{log.actor_name || log.user?.full_name || t('super_admin.audit_logs.system')}</div>
                          <div className="text-[10px] text-slate-400 truncate">{log.module}</div>
                       </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                      <Clock size={14} />
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <button onClick={() => setSelectedLog(log)} className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline">
                      {t('super_admin.audit_logs.view_diff')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onClick={() => setSelectedLog(null)}>
          <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-black text-slate-900 capitalize">{selectedLog.action} {selectedLog.entity_type}</h2><p className="text-sm text-slate-500">{selectedLog.actor_name || 'System'} • {new Date(selectedLog.created_at).toLocaleString()}</p></div><button onClick={() => setSelectedLog(null)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600">Close</button></div>
            <div className="grid gap-5 md:grid-cols-2"><section><h3 className="mb-2 text-sm font-black text-slate-700">Before</h3><pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(selectedLog.before_data, null, 2) || '—'}</pre></section><section><h3 className="mb-2 text-sm font-black text-slate-700">After</h3><pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(selectedLog.after_data, null, 2) || '—'}</pre></section></div>
          </div>
        </div>
      )}
    </div>
  );
}
