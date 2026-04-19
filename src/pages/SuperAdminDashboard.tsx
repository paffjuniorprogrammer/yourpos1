import React, { useEffect, useState } from "react";
import { LoadingPOS } from "../components/ui/LoadingPOS";
import { superAdminService } from "../services/superAdminService";
import { StatCard } from "../components/ui/StatCard";
import { 
  Building2, 
  Users, 
  TrendingUp, 
  ShieldCheck, 
  AlertCircle,
  Zap,
  LayoutDashboard
} from "lucide-react";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { BusinessesPage, OwnersPage } from "./super-admin/ModulePages";

export function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState<'businesses' | 'owners'>('businesses');
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);
        const data = await superAdminService.getSystemWideStats();
        setStats(data);
      } catch (err) {
        console.error("Dashboard stats error:", err);
        setError("Failed to connect to monitoring heartbeat.");
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  useRealtimeSync({
    onSaleCreated: () => {
      // Refresh system-wide stats when sales happen
      superAdminService.getSystemWideStats().then(setStats);
    }
    // We could add more hooks here for business registration etc.
  });

  if (loading) return <LoadingPOS />;

  return (
    <div className="space-y-12 animate-in fade-in duration-1000">
      {/* 🚀 TOP STATS SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <StatCard
          title="Total Ecosystem"
          value={String(stats?.totalBusinesses || 0)}
          icon={<Building2 size={24} />}
          meta="Integrated business nodes"
          tone="primary"
        />
        <StatCard
          title="Active Admins"
          value={String(stats?.totalAdmins || 0)}
          icon={<ShieldCheck size={24} />}
          meta="Verified business owners"
          tone="primary"
        />
        <StatCard
          title="System Integrity"
          value="STABLE"
          icon={<Zap size={24} />}
          meta="Node validation status"
          tone="success"
        />
      </div>

      {/* 📊 MAIN DASHBOARD (TABLE VIEW) */}
      <div className="pt-4">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between mb-8">
           <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                 <LayoutDashboard size={20} />
              </div>
              <div>
                 <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Command Center Live</h3>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Node Interaction Table</p>
              </div>
           </div>

           {/* Tab Switcher */}
           <div className="flex items-center p-1 rounded-2xl bg-slate-100 border border-slate-200">
              <button 
                onClick={() => setActiveTab('businesses')}
                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === 'businesses' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Businesses
              </button>
              <button 
                onClick={() => setActiveTab('owners')}
                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === 'owners' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Owners
              </button>
           </div>
        </div>
        
        {/* Dynamic Content */}
        {activeTab === 'businesses' ? (
          <BusinessesPage />
        ) : (
          <OwnersPage />
        )}
      </div>

      {error && (
        <div className="fixed bottom-10 right-10 flex items-center gap-4 p-6 rounded-3xl bg-rose-50 border border-rose-100 text-rose-600 shadow-2xl animate-in slide-in-from-right duration-500">
          <AlertCircle size={24} />
          <p className="font-black text-xs uppercase tracking-widest">{error}</p>
        </div>
      )}
    </div>
  );
}
