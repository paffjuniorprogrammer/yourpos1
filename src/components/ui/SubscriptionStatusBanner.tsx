import React from 'react';
import { Calendar, AlertTriangle, MessageCircle, Phone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const SubscriptionStatusBanner: React.FC = () => {
  const { profile, subscriptionDaysLeft, isSubscriptionActive, business, isDemoMode } = useAuth();

  if (!profile || profile.role === 'super_admin' || isDemoMode) return null;

  const days = subscriptionDaysLeft ?? 0;
  
  // Only show if expiring in 10 days or less, or if already expired
  if (days > 10 && isSubscriptionActive) return null;

  const isExpired = !isSubscriptionActive || days <= 0;
  const userName = profile?.full_name || 'wacu';
  const whatsappNumber = "250793063512";
  const whatsappMessage = `Mwiriwe, nshaka kongera ifatabuguzi rya ${business?.name || profile?.full_name || 'bizinesi yacu'}`;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;

  const daysText = days <= 0 ? "0" : `${days} ${days === 1 ? 'umunsi' : 'iminsi'}`;

  return (
    <div className={`mb-6 p-4 md:p-5 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top duration-500 shadow-sm ${
      isExpired 
      ? 'bg-rose-50 border-rose-200 text-rose-900' 
      : 'bg-amber-50 border-amber-200 text-amber-900'
    }`}>
      <div className="flex items-start md:items-center gap-4 flex-1">
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
          isExpired ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'
        }`}>
          {isExpired ? <AlertTriangle size={24} /> : <Calendar size={24} />}
        </div>
        <div className="space-y-1">
          <h4 className="font-black text-sm uppercase tracking-wider flex items-center gap-2">
            {isExpired ? 'Ifatabuguzi Ryarangiye' : 'Ifatabuguzi Riri Hafi Kurangira'}
          </h4>
          <p className="text-xs md:text-sm font-bold leading-relaxed opacity-90">
            Mwirweneza <span className="font-black underline">{userName}</span>, Twabibutsagako ifatabuguzi ryanyu ririhafi kurangira hasigaye <span className="font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded-md">{daysText}</span> turabasaba kongera waduhamagara kwiyi Tel: <a href="tel:0793063512" className="underline font-black hover:text-emerald-700">0793063512</a> cq ukaduha ubutumwa kuri whatsapp.
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 w-full md:w-auto justify-end">
        <a 
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200 w-full md:w-auto"
        >
          <MessageCircle size={16} />
          WhatsApp
        </a>
        <a 
          href="tel:0793063512"
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 bg-slate-800 hover:bg-slate-900 text-white shadow-md md:hidden"
        >
          <Phone size={16} />
        </a>
      </div>
    </div>
  );
};

