import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, CreditCard, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function SubscriptionExpiredPage() {
  const { business, logout } = useAuth();
  const navigate = useNavigate();
  
  const isSuspended = business?.status === 'suspended';

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] bg-white p-8 shadow-soft">
        <div className="mb-6 flex justify-center">
          <div className={`rounded-2xl ${isSuspended ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning'} p-4`}>
            <ShieldAlert size={48} />
          </div>
        </div>
        
        <h1 className="mb-2 text-center text-2xl font-bold text-ink">
          {isSuspended ? 'Account Suspended' : 'Subscription Expired'}
        </h1>
        
        <p className="mb-8 text-center text-ink/60">
          {isSuspended 
            ? `The account for "${business?.name ?? 'your business'}" has been suspended by the system administrator. Please contact support for assistance.`
            : `The subscription for "${business?.name ?? 'your business'}" ended on ${business?.subscription_end_date ? new Date(business.subscription_end_date).toLocaleDateString() : 'an unknown date'}. Renew now to continue using the POS system.`
          }
        </p>

        <div className="space-y-3">
          {!isSuspended && (
            <button
              onClick={() => navigate('/subscription')}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-semibold text-white shadow-soft transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <CreditCard size={20} />
              Renew Subscription
            </button>
          )}
          
          <button
            onClick={() => logout()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-canvas py-4 font-semibold text-ink transition-all hover:bg-canvas-dark"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>

        <div className="mt-8 border-t border-canvas pt-6 text-center">
          <p className="text-sm text-ink/40">
            Need help? <a href="mailto:support@pos-saas.com" className="font-semibold text-primary underline">Contact Support</a>
          </p>
        </div>
      </div>
    </div>
  );
}
