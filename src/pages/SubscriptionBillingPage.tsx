import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, CreditCard, Info, Send } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { LoadingPOS } from "../components/ui/LoadingPOS";
import { superAdminService } from "../services/superAdminService";

type SubscriptionRequest = {
  id: string;
  amount_paid: number;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  transaction_id: string;
};

type SubscriptionPlan = {
  id: string;
  name: string;
  description?: string | null;
  price_monthly?: number | null;
  is_active?: boolean;
};

function money(amount: number | null | undefined) {
  if (amount == null || Number.isNaN(amount)) return "Custom";
  return `${amount.toLocaleString()} RWF`;
}

function countdownLabel(endDate: string | null) {
  if (!endDate) return "Not set";
  const now = Date.now();
  const expiry = new Date(endDate).getTime();
  const diff = expiry - now;
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  if (days > 0) return `${days}d ${hours}h left`;
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  return `${hours}h ${minutes}m left`;
}

export function SubscriptionBillingPage() {
  const { business } = useAuth();

  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const [liveBusiness, setLiveBusiness] = useState<any>(null);

  const [transactionId, setTransactionId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentPlan = useMemo(() => plans.find((plan) => plan.id === liveBusiness?.plan_id) ?? null, [plans, liveBusiness?.plan_id]);
  const otherPlans = useMemo(() => plans.filter((plan) => plan.id !== liveBusiness?.plan_id), [plans, liveBusiness?.plan_id]);

  const expiry = liveBusiness?.subscription_end_date ?? null;
  const isExpired = expiry ? new Date(expiry) < new Date() : false;
  const countdown = countdownLabel(expiry);
  const pendingRequest = requests.find((r) => r.status === "pending") ?? null;

  const amount = String(currentPlan?.price_monthly ?? 0);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  async function load() {
    if (!business?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const bizRes = await supabase.from('businesses').select('*').eq('id', business.id).single();
      const planData = await superAdminService.getSubscriptionPlans().catch(err => {
        console.warn('Plans error:', err);
        return [];
      });
      const requestData = await fetchRequests(business.id).catch(err => {
        console.warn('Requests error:', err);
        return [];
      });

      const uniquePlans = Array.from(new Map((planData || []).map((p: any) => [p.name, p])).values());
      
      setPlans(uniquePlans as SubscriptionPlan[]);
      setRequests(requestData);
      if (bizRes.data) {
        setLiveBusiness(bizRes.data);
      } else if (business) {
        setLiveBusiness(business); // graceful fallback to AuthContext
      }
    } catch (err) {
      console.error("Failed to load subscription page:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchRequests(businessId: string) {
    const { data, error } = await supabase
      .from("subscription_requests")
      .select("id, amount_paid, created_at, status, transaction_id")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []) as SubscriptionRequest[];
  }

  async function submitProof(e: React.FormEvent) {
    e.preventDefault();
    if (!business?.id || !transactionId.trim()) return;

    try {
      setSubmitting(true);
      const { error } = await supabase.from("subscription_requests").insert({
        business_id: business.id,
        plan_id: liveBusiness?.plan_id,
        amount_paid: parseFloat(amount),
        transaction_id: transactionId.trim(),
        payment_method: "MTN MoMo",
        status: "pending",
      });

      if (error) throw error;

      setTransactionId("");
      setRequests(await fetchRequests(business.id));
    } catch (err) {
      console.error("Submission failed:", err);
      alert("Failed to submit payment proof. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingPOS />;

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Subscription</h1>
        <p className="text-slate-500 font-medium">See your plan, your expiry, and submit renewal proof.</p>
      </div>

      <div className={`rounded-[2.5rem] border p-8 ${isExpired ? "border-error/20 bg-error/5" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-white ${isExpired ? "bg-error" : "bg-slate-950"}`}>
              <CreditCard size={26} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">Current Plan</p>
              <p className="text-2xl font-black text-slate-900">{currentPlan?.name || "Not set"}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">{currentPlan ? `${money(currentPlan.price_monthly)}/mo` : "Ask super admin to assign a plan"}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</p>
              <p className={`mt-1 text-sm font-black ${isExpired ? "text-error" : "text-slate-900"}`}>{isExpired ? "Expired" : "Active"}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Expiry Date</p>
              <p className="mt-1 text-sm font-black text-slate-900">{expiry ? new Date(expiry).toLocaleDateString() : "Not set"}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Countdown</p>
              <p className={`mt-1 text-sm font-black ${countdown === "Expired" ? "text-error" : "text-slate-900"}`}>{countdown}</p>
            </div>
          </div>
        </div>

        {pendingRequest ? (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-warning/20 bg-warning/10 p-4 text-warning">
            <Clock size={18} />
            <p className="text-sm font-semibold">
              Payment proof pending review: <span className="font-black">{pendingRequest.transaction_id}</span>
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">Available Plans</h2>
            <p className="mt-1 text-sm text-slate-500">Your current plan is selected. Other plans are shown for reference.</p>

            <div className="mt-6 space-y-3">
              <div className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 p-5">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate">{currentPlan?.name || "Not set"}</p>
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{currentPlan?.description || "This is the plan assigned to your business."}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-slate-900">{currentPlan ? `${money(currentPlan.price_monthly)}/mo` : "-"}</p>
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-600">
                    <CheckCircle2 size={12} />
                    Current
                  </div>
                </div>
              </div>

              {otherPlans.length > 0 ? (
                <details className="rounded-2xl border border-slate-200 p-5">
                  <summary className="cursor-pointer select-none text-sm font-black text-slate-900">
                    Show other plans ({otherPlans.length})
                  </summary>
                  <div className="mt-4 space-y-3">
                    {otherPlans.map((plan) => (
                      <div key={plan.id} className="flex items-start justify-between gap-4 rounded-2xl bg-white p-4 border border-slate-100">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-900 truncate">{plan.name}</p>
                          <p className="mt-1 text-xs text-slate-500 line-clamp-2">{plan.description || "Plan details not provided."}</p>
                        </div>
                        <p className="shrink-0 text-sm font-black text-slate-900">{`${money(plan.price_monthly)}/mo`}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </div>

          <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">Payment Proof History</h2>

            <div className="mt-6 space-y-3">
              {requests.length === 0 ? (
                <p className="text-sm text-slate-500">No payment proofs yet.</p>
              ) : (
                requests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between rounded-2xl border border-slate-100 p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">Ref: {req.transaction_id}</p>
                      <p className="mt-1 text-xs text-slate-500">{new Date(req.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-900">{money(req.amount_paid)}</p>
                      <p
                        className={`mt-1 text-[10px] font-black uppercase tracking-widest ${
                          req.status === "approved" ? "text-success" : req.status === "rejected" ? "text-error" : "text-warning"
                        }`}
                      >
                        {req.status}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <form onSubmit={submitProof} className="rounded-[2.5rem] bg-slate-950 p-8 text-white shadow-2xl">
            <h2 className="text-lg font-black">Submit Renewal Proof</h2>
            <p className="mt-1 text-sm text-slate-300">After paying, paste the transaction ID here.</p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">Amount (RWF)</label>
                <input
                  readOnly
                  value={amount}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 font-black text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">Transaction ID</label>
                <input
                  required
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g. 1928374655"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 font-extrabold text-white outline-none ring-primary/20 placeholder:text-white/20 focus:ring-4"
                />
                <p className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <Info size={12} />
                  Use the reference from your payment SMS
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !transactionId.trim()}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
            >
              <Send size={16} />
              {submitting ? "Submitting..." : "Submit Proof"}
            </button>
          </form>

          <div className="rounded-[2.5rem] border border-slate-200 bg-white p-6">
            <div className="flex items-start gap-3 text-slate-600">
              <AlertCircle size={18} className="mt-0.5" />
              <p className="text-sm font-medium">
                Proofs are reviewed by the super admin. When approved, your subscription end date is extended.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
