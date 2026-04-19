import React, { useEffect, useState } from "react";
import { 
  LifeBuoy, 
  Search, 
  Building2, 
  Eye, 
  Terminal, 
  Database, 
  ShieldCheck,
  Zap,
  ArrowRight
} from "lucide-react";
import { superAdminService } from "../../services/superAdminService";
import { useAuth } from "../../context/AuthContext";
import { LoadingPOS } from "../../components/ui/LoadingPOS";

export function SupportPage() {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { impersonateBusiness } = useAuth();
  const [activeImpersonation, setActiveImpersonation] = useState<string | null>(null);

  useEffect(() => {
    fetchBusinesses();
  }, []);

  async function fetchBusinesses() {
    try {
      setLoading(true);
      const data = await superAdminService.getAllBusinesses();
      setBusinesses(data);
    } catch (err) {
      console.error("Failed to fetch businesses:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleImpersonate = (biz: any) => {
    impersonateBusiness(biz.id);
    setActiveImpersonation(biz.name);
    // In a real app, this might redirect to the dashboard with a special flag
    alert(`Now impersonating ${biz.name}. Accessing data in Read-Only mode.`);
  };

  const filtered = businesses.filter(b => 
    b.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <LoadingPOS />;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Support & Debug Tools</h1>
          <p className="text-slate-500 font-medium">Tools to troubleshoot and fix tenant issues.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Impersonation Card */}
        <div className="rounded-[2.5rem] bg-white p-10 border border-slate-200 shadow-sm relative overflow-hidden">
           <div className="absolute right-0 top-0 h-32 w-32 bg-primary/5 rounded-bl-[100px] -mr-10 -mt-10" />
           
           <div className="flex items-center gap-4 mb-8">
             <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
               <Eye size={28} />
             </div>
             <div>
               <h3 className="text-2xl font-black text-slate-900 leading-tight">Business Impersonation</h3>
               <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Access data as a tenant</p>
             </div>
           </div>

           <p className="text-slate-600 mb-8 leading-relaxed">
             Select a business to view their dashboard, products, and sales exactly as they see it. 
             This is a <strong>Read-Only</strong> view to help you debug problems without asking for credentials.
           </p>

           <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Search business to impersonate..."
                className="w-full rounded-2xl bg-slate-50 border-none py-4 pl-12 pr-4 font-semibold outline-none ring-primary/20 focus:ring-4"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>

           <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {filtered.map(biz => (
                <button 
                  key={biz.id}
                  onClick={() => handleImpersonate(biz)}
                  className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-primary hover:text-white transition-all group border border-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <Building2 size={16} className="group-hover:text-white/80" />
                    <span className="font-bold text-sm">{biz.name}</span>
                  </div>
                  <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0" />
                </button>
              ))}
           </div>

           {activeImpersonation && (
             <div className="mt-8 rounded-2xl bg-success/10 p-5 border border-success/20 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase text-success tracking-widest leading-none mb-1">Active Impersonation</p>
                  <p className="text-sm font-bold text-success">{activeImpersonation}</p>
                </div>
                <button 
                  onClick={() => {
                    impersonateBusiness(null);
                    setActiveImpersonation(null);
                  }}
                  className="rounded-xl bg-success/20 px-4 py-2 text-xs font-black uppercase tracking-widest text-success hover:bg-success/30"
                >
                  Stop
                </button>
             </div>
           )}
        </div>

        {/* System Tools Card */}
        <div className="space-y-6">
           <div className="rounded-[2.5rem] bg-slate-900 p-10 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute right-0 top-0 p-8 opacity-10">
                <Terminal size={120} />
              </div>

              <h3 className="text-2xl font-black mb-6">System Level Controls</h3>
              
              <div className="space-y-4">
                <button className="w-full flex items-center justify-between p-6 rounded-[1.5rem] bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                   <div className="flex items-center gap-4 text-left">
                     <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-warning/20 text-warning">
                       <Zap size={20} />
                     </div>
                     <div>
                       <p className="font-black text-sm">Clear System Cache</p>
                       <p className="text-xs text-slate-400">Force refresh all user sessions</p>
                     </div>
                   </div>
                   <ArrowRight size={16} className="text-slate-600 group-hover:translate-x-1 transition-transform" />
                </button>

                <button className="w-full flex items-center justify-between p-6 rounded-[1.5rem] bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                   <div className="flex items-center gap-4 text-left">
                     <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-primary/20 text-primary">
                       <Database size={20} />
                     </div>
                     <div>
                       <p className="font-black text-sm">Database Maintenance</p>
                       <p className="text-xs text-slate-400">Reindex and vacuum tables</p>
                     </div>
                   </div>
                   <ArrowRight size={16} className="text-slate-600 group-hover:translate-x-1 transition-transform" />
                </button>

                <button className="w-full flex items-center justify-between p-6 rounded-[1.5rem] bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                   <div className="flex items-center gap-4 text-left">
                     <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-success/20 text-success">
                       <ShieldCheck size={20} />
                     </div>
                     <div>
                       <p className="font-black text-sm">Global Feature Lock</p>
                       <p className="text-xs text-slate-400">Toggle POS or Reports globally</p>
                     </div>
                   </div>
                   <ArrowRight size={16} className="text-slate-600 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
