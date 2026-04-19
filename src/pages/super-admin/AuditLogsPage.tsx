import React, { useEffect, useState } from "react";
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
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

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
    log.table_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.business?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'INSERT': return <Plus size={16} className="text-success" />;
      case 'UPDATE': return <Edit3 size={16} className="text-warning" />;
      case 'DELETE': return <Trash2 size={16} className="text-error" />;
      default: return <ArrowLeftRight size={16} />;
    }
  };

  if (loading) return <LoadingPOS />;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">System Audit Logs</h1>
          <p className="text-slate-500 font-medium">Global history of all system-wide modifications.</p>
        </div>
        <button className="flex items-center gap-2 rounded-2xl bg-white border border-slate-200 px-6 py-4 font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 active:scale-95">
          <Download size={20} />
          Export Logs
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text"
            placeholder="Filter by action, table, or business..."
            className="w-full rounded-2xl border-none bg-white py-4 pl-12 pr-4 shadow-sm outline-none ring-primary/20 transition-all focus:ring-4 placeholder:text-slate-400 font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 rounded-2xl bg-white border border-slate-200 px-6 py-4 font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50">
          <Filter size={20} />
          All Tables
        </button>
      </div>

      <div className="overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase tracking-widest text-slate-400">
                <th className="px-8 py-6">Event</th>
                <th className="px-8 py-6">Business</th>
                <th className="px-8 py-6">User</th>
                <th className="px-8 py-6">Time</th>
                <th className="px-8 py-6 text-right">Details</th>
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
                        <div className="text-sm font-black text-slate-900">{log.action}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{log.table_name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                       <Building2 size={14} className="text-slate-400" />
                       <span className="text-sm font-bold text-slate-600">{log.business?.name || 'GLOBAL'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                       <User size={14} className="text-slate-400" />
                       <div className="overflow-hidden">
                          <div className="text-sm font-bold text-slate-600 truncate">{log.user?.full_name || 'SYSTEM'}</div>
                          <div className="text-[10px] text-slate-400 truncate">{log.user?.email}</div>
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
                    <button className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline">
                      View Diff
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
