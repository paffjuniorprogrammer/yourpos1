import React, { type ReactNode } from "react";
import { LucideIcon, ArrowUpRight, ArrowDownRight } from "lucide-react";

type StatCardProps = {
  title: string;
  value: string;
  meta?: string;
  icon?: LucideIcon | ReactNode;
  tone?: "sky" | "emerald" | "amber" | "rose" | "indigo" | "orange" | "primary" | "success" | "warning";
  trend?: {
    value: number;
    isPositive: boolean;
  };
};

const tones = {
  sky: "bg-sky-50 text-sky-700 ring-sky-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  orange: "bg-orange-50 text-orange-700 ring-orange-100",
  primary: "bg-blue-50 text-blue-700 ring-blue-100",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
};

const iconTones = {
  sky: "bg-sky-100 text-sky-600",
  emerald: "bg-emerald-100 text-emerald-600",
  amber: "bg-amber-100 text-amber-600",
  rose: "bg-rose-100 text-rose-600",
  indigo: "bg-indigo-100 text-indigo-100/50 text-indigo-600",
  orange: "bg-orange-100 text-orange-600",
  primary: "bg-blue-100 text-blue-600",
  success: "bg-emerald-100 text-emerald-600",
  warning: "bg-amber-100 text-amber-600",
};

export function StatCard({ title, value, meta, icon, tone = "sky", trend }: StatCardProps) {
  // Determine if icon is a component or an element
  const renderIcon = () => {
    if (!icon) return null;
    
    // If it's already a JSX element like <Icon />, just return it
    if (React.isValidElement(icon)) return icon;
    
    // If it's a component type (Function or forwardRef object), render it
    const IconComp = icon as any;
    return <IconComp size={20} />;
  };

  return (
    <div className={`group relative overflow-hidden rounded-[2rem] p-6 shadow-sm ring-1 transition-all hover:shadow-xl hover:-translate-y-1 ${tones[tone]}`}>
      <div className="relative z-10 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 leading-tight mb-2">
            {title}
          </p>
          <p className="text-3xl font-black tracking-tight leading-none">
            {value}
          </p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition-transform group-hover:scale-110 ${iconTones[tone]}`}>
          {renderIcon()}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        {trend ? (
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
            trend.isPositive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
          }`}>
            {trend.isPositive ? <ArrowUpRight size={12} strokeWidth={3} /> : <ArrowDownRight size={12} strokeWidth={3} />}
            {trend.value}%
          </div>
        ) : meta ? (
          <span className="rounded-xl bg-white/40 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest leading-none">
            {meta}
          </span>
        ) : null}
      </div>
      
      {/* Decorative pulse glow */}
      <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-white opacity-10 blur-3xl transition-opacity group-hover:opacity-20" />
    </div>
  );
}
