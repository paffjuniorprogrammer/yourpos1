import React from 'react';
import { Calendar, AlertTriangle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const SubscriptionStatusBanner: React.FC = () => {
  const { profile, subscriptionDaysLeft, isSubscriptionActive } = useAuth();

  if (!profile || profile.role !== 'admin') return null;

  const days = subscriptionDaysLeft ?? 0;
  
  // Only show if expiring in 10 days or less, or if already expired
  if (days > 10 && isSubscriptionActive) return null;

  const isExpired = !isSubscriptionActive || days <= 0;

  return (
    <div className={`mb-6 p-4 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top duration-500 shadow-sm ${
      isExpired 
      ? 'bg-rose-50 border-rose-100 text-rose-800' 
      : 'bg-amber-50 border-amber-100 text-amber-800'
    }`}>
      <div className="flex items-center gap-4">
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center shadow-sm ${
          isExpired ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'
        }`}>
          {isExpired ? <AlertTriangle size={24} /> : <Calendar size={24} />}
        </div>
        <div>
          <h4 className="font-black text-sm uppercase tracking-wider">
            {isExpired ? 'Subscription Expired' : 'Subscription Ending Soon'}
          </h4>
          <p className="text-xs font-bold opacity-80">
            {isExpired 
              ? 'Your access is limited. Please contact support or renew your plan.' 
              : `Your plan expires in ${days} ${days === 1 ? 'day' : 'days'}. Renew now to avoid disruption.`}
          </p>
        </div>
      </div>
      
      <button className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 ${
        isExpired 
        ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-200' 
        : 'bg-amber-600 text-white hover:bg-amber-700 shadow-lg shadow-amber-200'
      }`}>
        Renew Plan
        <ArrowRight size={14} />
      </button>
    </div>
  );
};
