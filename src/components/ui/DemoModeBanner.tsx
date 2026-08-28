import React from "react";
import { Rocket, LogOut, Info, Building2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export const DemoModeBanner: React.FC = () => {
  const { isDemoMode, exitDemoMode, activeLocationId, assignedLocations, switchLocation } = useAuth();

  if (!isDemoMode) return null;

  return (
    <div className="bg-gradient-to-r from-purple-900 via-brand-900 to-indigo-900 text-white px-4 py-2.5 shadow-md flex flex-col sm:flex-row items-center justify-between gap-3 text-xs z-50">
      
      <div className="flex items-center gap-2.5">
        <span className="p-1.5 bg-amber-400 text-slate-900 rounded-lg font-black uppercase tracking-wider text-[10px] flex items-center gap-1 animate-pulse">
          <Rocket size={13} />
          LIVE DEMO
        </span>
        <p className="font-semibold text-slate-200">
          You are exploring the POS in <strong className="text-white font-extrabold">Interactive Sandbox Mode</strong>. Real database data is 100% untouched.
        </p>
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
        {assignedLocations.length > 0 && (
          <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-xl border border-white/20">
            <Building2 size={13} className="text-amber-300" />
            <select
              value={activeLocationId || ""}
              onChange={(e) => switchLocation(e.target.value)}
              className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer"
            >
              {assignedLocations.map((loc) => (
                <option key={loc.id} value={loc.id} className="bg-slate-900 text-white">
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={exitDemoMode}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-black uppercase tracking-wider text-[11px] bg-rose-500 hover:bg-rose-600 text-white transition active:scale-95 shadow-sm"
        >
          <LogOut size={13} />
          Exit Demo
        </button>
      </div>

    </div>
  );
};
