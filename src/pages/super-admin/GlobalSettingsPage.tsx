import React, { useEffect, useState } from "react";
import { 
  Settings2, 
  Globe, 
  Mail, 
  DollarSign, 
  ShieldAlert, 
  Save,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { LoadingPOS } from "../../components/ui/LoadingPOS";

export function GlobalSettingsPage() {
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .order('category');
      
      if (error) throw error;
      setSettings(data || []);
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleUpdateSetting = (key: string, value: string) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
  };

  async function saveSettings() {
    try {
      setSaving(true);
      setMessage(null);
      
      for (const setting of settings) {
        await supabase
          .from('system_settings')
          .update({ value: setting.value, updated_at: new Date().toISOString() })
          .eq('key', setting.key);
      }

      setMessage({ type: 'success', text: 'Global configuration updated successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error("Save failed:", err);
      setMessage({ type: 'error', text: 'Failed to update settings.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingPOS />;

  const categories = Array.from(new Set(settings.map(s => s.category)));

  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Global Configuration</h1>
          <p className="text-slate-500 font-medium">Control the identity and behavior of the entire platform.</p>
        </div>
        <button 
          onClick={saveSettings}
          disabled={saving}
          className="flex items-center gap-2 rounded-2xl bg-slate-950 px-8 py-4 font-black text-white shadow-2xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 ring-4 ring-slate-950/10"
        >
          {saving ? <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={20} />}
          {saving ? 'SAVING...' : 'SAVE CHANGES'}
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-3 rounded-[1.5rem] p-6 border ${
          message.type === 'success' ? 'bg-success/10 border-success/20 text-success' : 'bg-error/10 border-error/20 text-error'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <p className="font-bold text-sm tracking-tight">{message.text}</p>
        </div>
      )}

      <div className="space-y-8">
        {categories.map(category => (
          <div key={category} className="rounded-[2.5rem] bg-white p-10 border border-slate-200 shadow-sm">
             <div className="flex items-center gap-3 mb-8">
                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 capitalize">
                  {category === 'general' ? <Globe size={20} /> : <Settings2 size={20} />}
                </div>
                <h3 className="text-xl font-black text-slate-900 leading-tight uppercase tracking-tight">{category} Settings</h3>
             </div>

             <div className="space-y-8">
                {settings.filter(s => s.category === category).map((setting) => (
                  <div key={setting.key} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start pb-8 border-b border-slate-50 last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-black text-slate-900 mb-1">{setting.key.replace(/_/g, ' ').toUpperCase()}</p>
                      <p className="text-xs text-slate-400 font-medium leading-relaxed">{setting.description}</p>
                    </div>
                    <div className="md:col-span-2">
                      {setting.key === 'maintenance_mode' ? (
                        <div className="flex items-center gap-4">
                           <button 
                            onClick={() => handleUpdateSetting(setting.key, setting.value === 'true' ? 'false' : 'true')}
                            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors outline-none ring-primary/20 focus:ring-4 ${
                              setting.value === 'true' ? 'bg-error' : 'bg-slate-200'
                            }`}
                           >
                             <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                               setting.value === 'true' ? 'translate-x-7' : 'translate-x-1'
                             }`} />
                           </button>
                           <span className={`text-xs font-black uppercase tracking-widest ${setting.value === 'true' ? 'text-error' : 'text-slate-400'}`}>
                             {setting.value === 'true' ? 'Active' : 'Disabled'}
                           </span>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                             {setting.key.includes('email') ? <Mail size={18} /> : 
                              setting.key.includes('currency') ? <DollarSign size={18} /> : <Settings2 size={18} />}
                          </div>
                          <input 
                            type="text"
                            value={setting.value}
                            onChange={(e) => handleUpdateSetting(setting.key, e.target.value)}
                            className="w-full rounded-2xl bg-slate-50 border-none py-4 pl-12 pr-4 font-semibold outline-none ring-primary/20 focus:ring-4 transition-all"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
             </div>
          </div>
        ))}

        <div className="rounded-[2.5rem] bg-error/5 p-10 border border-error/10">
           <div className="flex items-center gap-4 text-error mb-4">
              <ShieldAlert size={28} />
              <h3 className="text-xl font-black italic">Danger Zone</h3>
           </div>
           <p className="text-sm font-medium text-slate-600 mb-6 max-w-lg">
             Actions here are irreversible. Modifying global parameters can disrupt service for all business tenants.
           </p>
           <button className="rounded-xl border border-error/30 bg-white px-6 py-3 text-xs font-black uppercase tracking-widest text-error hover:bg-error hover:text-white transition-all">
             Reset All Global Settings
           </button>
        </div>
      </div>
    </div>
  );
}
