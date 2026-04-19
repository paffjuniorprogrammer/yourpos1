import React from 'react';

export const LoadingPOS: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white">
      <div className="relative">
        {/* Animated Background Ring */}
        <div className="absolute -inset-4 rounded-full bg-brand-50 blur-xl animate-pulse"></div>
        
        {/* The POS Logo/Text */}
        <div className="relative flex items-center justify-center">
          <div className="text-6xl font-black tracking-tighter text-slate-900 flex">
            <span className="animate-bounce" style={{ animationDelay: '0s', animationDuration: '0.6s' }}>P</span>
            <span className="animate-bounce" style={{ animationDelay: '0.05s', animationDuration: '0.6s' }}>O</span>
            <span className="animate-bounce" style={{ animationDelay: '0.1s', animationDuration: '0.6s' }}>S</span>
          </div>
          
          {/* Shimmer Effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12 animate-[shimmer_1.5s_infinite]"></div>
        </div>
      </div>
      
      {/* Branding Message */}
      <div className="mt-8 flex flex-col items-center">
        <h2 className="text-sm font-semibold uppercase tracking-[0.4em] text-brand-600 animate-pulse">Your POS</h2>
        <div className="mt-4 h-1 w-48 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-brand-500 animate-[progress_1s_ease-in-out_infinite]"></div>
        </div>
        <p className="mt-3 text-xs font-medium text-slate-400">Optimized Performance</p>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-200%) skewX(-20deg); }
          100% { transform: translateX(200%) skewX(-20deg); }
        }
        @keyframes progress {
          0% { width: 0%; transform: translateX(-100%); }
          50% { width: 70%; transform: translateX(0%); }
          100% { width: 0%; transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};
