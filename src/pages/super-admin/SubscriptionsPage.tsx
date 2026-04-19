import React, { useEffect, useState } from "react";
import { 
  CreditCard, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ArrowUpRight, 
  Building2,
  Filter,
  Search,
  Check,
  X
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { LoadingPOS } from "../../components/ui/LoadingPOS";

export function SubscriptionsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  async function fetchRequests() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('subscription_requests')
        .select(`
          *,
          business:businesses(id, name, subscription_end_date)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error("Failed to fetch requests:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleProcessRequest = async (request: any, status: 'approved' | 'rejected') => {
    try {
      setProcessingId(request.id);
      
      // 1. Update the request status
      const { error: reqError } = await supabase
        .from('subscription_requests')
        .update({ 
          status, 
          processed_at: new Date().toISOString(),
          processed_by: (await supabase.auth.getUser()).data.user?.id 
        })
        .eq('id', request.id);

      if (reqError) throw reqError;

      // 2. If approved, extend the business subscription by 30 days
      if (status === 'approved') {
        const currentEnd = new Date(request.business.subscription_end_date || new Date());
        const newEnd = new Date(currentEnd.getTime() + (30 * 24 * 60 * 60 * 1000));
        
        const { error: bizError } = await supabase
          .from('businesses')
          .update({ 
            subscription_end_date: newEnd.toISOString(),
            status: 'active' 
          })
          .eq('id', request.business.id);
        
        if (bizError) throw bizError;
      }

      fetchRequests();
    } catch (err) {
      console.error("Processing failed:", err);
      alert("Error processing request. Check console.");
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <LoadingPOS />;

  const pending = requests.filter(r => r.status === 'pending');
  const history = requests.filter(r => r.status !== 'pending');

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Subscription Engine</h1>
          <p className="text-slate-500 font-medium">Verify payment proofs and manage tenant billing cycles.</p>
        </div>
      </div>

      {/* Pending Requests */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Clock size={20} className="text-warning" />
          <h2 className="text-xl font-black text-slate-900 leading-tight uppercase tracking-tight">Pending Verification ({pending.length})</h2>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-[2.5rem] bg-slate-50 border-2 border-dashed border-slate-200 p-20 text-center">
             <div className="h-20 w-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300 shadow-sm">
                <CheckCircle2 size={40} />
             </div>
             <p className="text-slate-400 font-black uppercase tracking-widest text-xs">All clear! No pending payments.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {pending.map(req => (
              <div key={req.id} className="group rounded-[2.5rem] bg-white border border-slate-200 p-8 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1">
                 <div className="flex items-center justify-between mb-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/10 text-warning">
                       <CreditCard size={24} />
                    </div>
                    <span className="text-sm font-black text-slate-900 tracking-tight">${req.amount_paid}</span>
                 </div>

                 <div className="mb-8">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Business</p>
                    <h3 className="text-xl font-black text-slate-900 truncate">{req.business?.name}</h3>
                    <div className="flex items-center gap-2 mt-2 text-xs font-bold text-slate-400">
                      <ArrowUpRight size={14} />
                      MoMo ID: <span className="text-slate-900">{req.transaction_id}</span>
                    </div>
                 </div>

                 <div className="flex gap-3">
                    <button 
                      onClick={() => handleProcessRequest(req, 'approved')}
                      disabled={!!processingId}
                      className="flex-1 rounded-xl bg-success px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-success/20 transition-all hover:scale-[1.05] active:scale-95 disabled:opacity-50"
                    >
                      {processingId === req.id ? '...' : 'Approve'}
                    </button>
                    <button 
                      onClick={() => handleProcessRequest(req, 'rejected')}
                      disabled={!!processingId}
                      className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-error/10 hover:text-error transition-all"
                    >
                      Reject
                    </button>
                 </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <History size={20} className="text-slate-400" />
          <h2 className="text-xl font-black text-slate-900 leading-tight uppercase tracking-tight">Recent Decisions</h2>
        </div>

        <div className="overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-left">
             <thead>
               <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase tracking-widest text-slate-400">
                 <th className="px-8 py-6">Business</th>
                 <th className="px-8 py-6">Transaction ID</th>
                 <th className="px-8 py-6">Amount</th>
                 <th className="px-8 py-6">Decision</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
               {history.map(req => (
                 <tr key={req.id} className="transition-colors hover:bg-slate-50/50">
                   <td className="px-8 py-6 font-black text-sm text-slate-900">{req.business?.name}</td>
                   <td className="px-8 py-6 font-bold text-xs text-slate-400 font-mono tracking-wider">{req.transaction_id}</td>
                   <td className="px-8 py-6 font-black text-sm text-slate-900">${req.amount_paid}</td>
                   <td className="px-8 py-6">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                        req.status === 'approved' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                      }`}>
                        {req.status === 'approved' ? <Check size={12} /> : <X size={12} />}
                        {req.status}
                      </span>
                   </td>
                 </tr>
               ))}
             </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

import { History } from "lucide-react";
