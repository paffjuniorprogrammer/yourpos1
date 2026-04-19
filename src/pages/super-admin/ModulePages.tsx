import React, { useEffect, useState } from "react";
import { LoadingPOS } from "../../components/ui/LoadingPOS";
import { superAdminService } from "../../services/superAdminService";
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  Eye, 
  Clock, 
  Power,
  Shield,
  Zap,
  Calendar,
  Mail,
  Lock,
  ArrowRight,
  Key,
  Building2
} from "lucide-react";
import { useNotification } from "../../context/NotificationContext";

// --- REUSABLE MODAL COMPONENT ---
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[2rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="text-xl font-black text-slate-900 tracking-tight">{title}</h3>
          <button onClick={onClose} className="h-10 w-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-300 transition-all">✕</button>
        </div>
        <div className="p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

// --- 📊 1. MAIN DASHBOARD (TABLE VIEW) ---
export function BusinessesPage() {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(null as any); // business record
  const [showDeleteModal, setShowDeleteModal] = useState(null as any); // business record
  const [showDetails, setShowDetails] = useState(null as any);
  const [resetPasswordOwner, setResetPasswordOwner] = useState<any>(null);
  const { showToast } = useNotification();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const closePopups = () => {
      setShowRegisterModal(false);
      setShowPlanModal(null);
      setShowDeleteModal(null);
      setShowDetails(null);
      setResetPasswordOwner(null);
    };

    window.addEventListener("super-admin:close-popups", closePopups);
    return () => window.removeEventListener("super-admin:close-popups", closePopups);
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [bizData, planData] = await Promise.all([
        superAdminService.getAllBusinesses(),
        superAdminService.getSubscriptionPlans()
      ]);
      const uniquePlans = Array.from(new Map((planData || []).map((p: any) => [p.name, p])).values());
      setBusinesses(bizData);
      setPlans(uniquePlans);
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleToggleStatus = async (biz: any) => {
    const newStatus = biz.status === 'active' ? 'suspended' : 'active';
    await superAdminService.updateBusiness(biz.id, { status: newStatus as any });
    loadData();
  };

  const handleExtend = async (biz: any) => {
    await superAdminService.quickExtendSubscription(biz.id, biz.subscription_end_date);
    loadData();
  };

  const handleResetPassword = async (biz: any) => {
    const owner = biz.owner;
    if (!owner || !owner.auth_user_id) {
      showToast("No administrator account found linked to this business profile.", "error");
      return;
    }
    setResetPasswordOwner({ ...owner, businessName: biz.name });
  };

  const handleDelete = async (biz: any) => {
    setShowDeleteModal(biz);
  };

  if (loading) return <LoadingPOS />;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Business Ecosystem</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time control center</p>
        </div>
        <button 
          onClick={() => setShowRegisterModal(true)}
          className="flex items-center gap-3 rounded-2xl bg-slate-950 px-8 py-4 font-black text-white text-xs uppercase tracking-[0.2em] shadow-2xl transition-all hover:bg-slate-800 active:scale-95"
        >
          <Plus size={16} />
          Register Business
        </button>
      </div>

      {/* 📊 BUSINESS TABLE */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse" style={{ minWidth: '1000px' }}>
          <thead className="bg-slate-50/50 border-b border-slate-100">
            <tr>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Business Name</th>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Plan</th>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Expiry Date</th>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Users</th>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right" style={{ minWidth: '340px' }}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {businesses.map((biz) => {
              const isExpired = biz.subscription_end_date && new Date(biz.subscription_end_date) < new Date();
              const status = isExpired ? 'expired' : biz.status;
              const daysLeft = biz.subscription_end_date 
                ? Math.ceil((new Date(biz.subscription_end_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) 
                : Infinity;
              const isCritical = daysLeft <= 15 && status !== 'expired';

              return (
                <tr key={biz.id} className="group hover:bg-slate-50/80 transition-all">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                        <Building2 size={20} />
                      </div>
                      <span className={`font-black ${isCritical ? 'text-rose-600' : 'text-slate-900'}`}>
                        {biz.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      status === 'active' ? 'bg-emerald-50 text-emerald-600' : 
                      status === 'expired' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      <div className={`h-1.5 w-1.5 rounded-full ${status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-current'}`} />
                      {status}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <span className="text-xs font-black text-primary uppercase tracking-wider">{biz.plan?.name || 'BASIC'}</span>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`text-xs font-bold ${isExpired ? 'text-rose-500' : 'text-slate-600'}`}>
                      {biz.subscription_end_date ? new Date(biz.subscription_end_date).toLocaleDateString() : 'Lifetime'}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className="text-sm font-black text-slate-900">{biz.user_count?.[0]?.count || 0}</span>
                  </td>
                  <td className="px-8 py-6 text-right" style={{ minWidth: '340px' }}>
                    <div className="flex items-center justify-end gap-2">
                      {/* Toggle Button */}
                      <button 
                        onClick={() => handleToggleStatus(biz)}
                        className={`h-9 px-4 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                          biz.status === 'active' 
                          ? 'bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-600' 
                          : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 shadow-sm'
                        }`}
                        title={biz.status === 'active' ? 'Suspend Access' : 'Enable Access'}
                      >
                         <Power size={14} />
                         {biz.status === 'active' ? 'ON' : 'OFF'}
                      </button>

                      <button onClick={() => setShowDetails(biz)} className="p-2.5 rounded-xl bg-slate-100 text-slate-400 hover:bg-slate-900 hover:text-white transition-all shadow-sm"><Eye size={16} /></button>
                      <button onClick={() => handleResetPassword(biz)} className="p-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-900 hover:text-white transition-all shadow-sm" title="Reset Admin Password"><Key size={16} /></button>
                      <button onClick={() => setShowPlanModal(biz)} className="p-2.5 rounded-xl bg-slate-100 text-slate-400 hover:bg-primary hover:text-white transition-all shadow-sm"><Zap size={16} /></button>
                      <button onClick={() => handleExtend(biz)} className="p-2.5 rounded-xl bg-slate-100 text-slate-400 hover:bg-slate-900 hover:text-white transition-all shadow-sm" title="+30 Days"><Clock size={16} /></button>
                      <button onClick={() => handleDelete(biz)} className="p-2.5 rounded-xl bg-slate-100 text-slate-400 hover:bg-rose-500 hover:text-white transition-all shadow-sm"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {businesses.length === 0 && (
          <div className="py-20 text-center text-slate-400 font-bold italic">No businesses records found matching criteria.</div>
        )}
      </div>

      {/* --- ➕ 2. REGISTER NEW BUSINESS (FORM) --- */}
      {showRegisterModal && (
        <RegisterModal onClose={() => setShowRegisterModal(false)} plans={plans} onComplete={loadData} />
      )}

      {/* --- 🔄 ASSIGN PLAN MODAL --- */}
      {showPlanModal && (
        <SetPlanModal business={showPlanModal} plans={plans} onClose={() => setShowPlanModal(null)} onComplete={loadData} />
      )}
      {showDeleteModal && (
        <DeleteBusinessModal 
          business={showDeleteModal} 
          onClose={() => setShowDeleteModal(null)} 
          onComplete={() => {
            setShowDeleteModal(null);
            loadData();
          }} 
        />
      )}

      {resetPasswordOwner && (
        <ResetPasswordModal 
          owner={resetPasswordOwner} 
          onClose={() => setResetPasswordOwner(null)} 
        />
      )}

      {/* --- 👁️ VIEW DETAILS MODAL --- */}
      {showDetails && (
        <Modal title="Business Details" onClose={() => setShowDetails(null)}>
           <div className="space-y-6">
              <div className="flex items-center gap-6 p-6 rounded-[1.5rem] bg-slate-50 border border-slate-100">
                 <div className="h-16 w-16 rounded-2xl bg-white flex items-center justify-center text-primary shadow-sm"><Building2 size={32} /></div>
                 <div>
                    <h4 className="text-xl font-black text-slate-900">{showDetails.name}</h4>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">ID: {showDetails.id}</p>
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="p-5 rounded-[1.5rem] border border-slate-100 bg-white">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Owner</p>
                    <p className="text-sm font-black text-slate-900">{showDetails.owner?.full_name || 'Not Set'}</p>
                    <p className="text-[11px] text-slate-500">{showDetails.owner?.email}</p>
                 </div>
                 <div className="p-5 rounded-[1.5rem] border border-slate-100 bg-white">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Created</p>
                    <p className="text-sm font-black text-slate-900">{new Date(showDetails.created_at).toLocaleDateString()}</p>
                 </div>
                 <div className="p-5 col-span-2 rounded-[1.5rem] border border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Subscription Days Left</p>
                      <p className="text-sm font-black text-slate-900">{showDetails.subscription_end_date ? (() => {
                        const dl = Math.ceil((new Date(showDetails.subscription_end_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                        if(dl < 0) return 'Expired';
                        return `${dl} Days`;
                      })() : 'Lifetime'}</p>
                    </div>
                    {showDetails.subscription_end_date && Math.ceil((new Date(showDetails.subscription_end_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) <= 15 && (
                      <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-600 text-[10px] font-black uppercase">Critical</span>
                    )}
                 </div>
              </div>
              <button onClick={() => setShowDetails(null)} className="w-full py-4 rounded-xl bg-slate-950 text-white font-black text-xs uppercase tracking-widest">Close Dashboard</button>
           </div>
        </Modal>
      )}
    </div>
  );
}

// --- MODAL COMPONENTS ---

function RegisterModal({ onClose, plans, onComplete }: any) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    planId: plans[0]?.id || '',
    status: 'active',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await superAdminService.registerBusinessComplete({
        name: formData.name,
        adminEmail: formData.email,
        adminName: formData.name + ' Admin',
        adminPassword: formData.password,
        planId: formData.planId || null,
        status: formData.status as any,
        expiryDate: new Date(formData.endDate).toISOString()
      });
      onComplete();
      onClose();
    } catch (err: any) {
      const msg = err?.message || err?.details || JSON.stringify(err);
      console.error('Registration error:', err);
      setErrorMsg(msg || 'Unknown error — check the browser console.');
    }
  };

  return (
    <Modal title="Register New Business" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
           {/* Section 1: Business */}
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Core Identity</p>
              <input 
                required 
                type="text" 
                placeholder="Business Name Ex: Fresh Market" 
                className="w-full h-14 px-6 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold text-slate-900"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
           </div>

           {/* Section 2: Admin */}
           <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Owner Email</p>
                <div className="relative">
                   <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                   <input 
                    required 
                    type="email" 
                    placeholder="admin@biz.com" 
                    className="w-full h-14 pl-12 pr-6 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold text-slate-900"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Password</p>
                <div className="relative">
                   <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                   <input 
                    required 
                    type="password" 
                    placeholder="••••••••" 
                    className="w-full h-14 pl-12 pr-6 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold text-slate-900"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                  />
                </div>
              </div>
           </div>

           {/* Section 3: Subscription */}
           <div className="pt-4 border-t border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Plan Configuration</p>
              <div className="grid grid-cols-2 gap-4">
                 <select 
                   className="w-full h-14 px-6 rounded-2xl bg-slate-50 border border-slate-100 font-black text-xs uppercase"
                   value={formData.planId}
                   onChange={(e) => setFormData({...formData, planId: e.target.value})}
                 >
                    {plans.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                 </select>
                 <select 
                   className="w-full h-14 px-6 rounded-2xl bg-slate-50 border border-slate-100 font-black text-xs uppercase"
                   value={formData.status}
                   onChange={(e) => setFormData({...formData, status: e.target.value})}
                 >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                 </select>
              </div>
           </div>

           <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Start Date</p>
                <input 
                  type="date" 
                  className="w-full h-14 px-6 rounded-2xl bg-slate-50 border border-slate-100 font-bold"
                  value={formData.startDate}
                  onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Expring Date</p>
                <input 
                  type="date" 
                  className="w-full h-14 px-6 rounded-2xl bg-slate-50 border border-slate-100 font-bold"
                  value={formData.endDate}
                  onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                />
              </div>
           </div>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold">
            ⚠️ {errorMsg}
          </div>
        )}

        <button type="submit" className="w-full py-6 rounded-[2rem] bg-slate-950 text-white font-black text-xs uppercase tracking-[0.3em] flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 active:scale-95">
           Finalize & Launch Node
           <ArrowRight size={16} />
        </button>
      </form>
    </Modal>
  );
}

function SetPlanModal({ business, plans, onClose, onComplete }: any) {
  const [selectedPlanId, setSelectedPlanId] = useState(business.plan_id || plans[0]?.id);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(business.subscription_end_date ? new Date(business.subscription_end_date).toISOString().split('T')[0] : '');

  const handlePlanChange = (pid: string) => {
    setSelectedPlanId(pid);
    const plan = plans.find((p: any) => p.id === pid);
    // Simple auto-calc (usually durations are in months or days in DB)
    // We'll just default to 30 days if plan name contains 1, 90 if 3, etc.
    const days = pid.includes('1 Month') ? 30 : pid.includes('3 Month') ? 90 : 365;
    const newEnd = new Date(new Date(startDate).getTime() + days * 24 * 60 * 60 * 1000);
    setEndDate(newEnd.toISOString().split('T')[0]);
  };

  const handleSave = async () => {
    await superAdminService.updateBusiness(business.id, {
      plan_id: selectedPlanId,
      subscription_end_date: new Date(endDate).toISOString()
    });
    onComplete();
    onClose();
  };

  return (
    <Modal title={`Set Plan: ${business.name}`} onClose={onClose}>
      <div className="space-y-6">
         <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Select Subscription Tier</p>
            <div className="grid gap-3">
               {plans.map((p: any) => (
                 <button 
                  key={p.id} 
                  onClick={() => handlePlanChange(p.id)}
                  className={`w-full py-5 px-8 rounded-2xl border text-left flex items-center justify-between transition-all ${
                    selectedPlanId === p.id ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/10' : 'border-slate-100 hover:border-slate-200'
                  }`}
                 >
                    <span className="font-black text-xs uppercase tracking-widest">{p.name}</span>
                    {selectedPlanId === p.id && <Zap size={16} fill="currentColor" />}
                 </button>
               ))}
            </div>
         </div>

         <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Start Date</p>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full h-14 px-6 rounded-2xl bg-slate-50 border border-slate-100 font-bold" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Expiry Date</p>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full h-14 px-6 rounded-2xl bg-slate-50 border border-slate-100 font-bold" />
            </div>
         </div>

         <button onClick={handleSave} className="w-full py-6 rounded-[2rem] bg-slate-950 text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-slate-800 transition-all active:scale-95">
           Update Subscription Term
         </button>
      </div>
    </Modal>
  );
}

// --- 💳 3. SUBSCRIPTION SETTINGS PAGE ---
export function SubscriptionsPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    try {
      setLoading(true);
      const data = await superAdminService.getSubscriptionPlans();
      // Defensive fallback: remove duplicates in case the database was seeded multiple times
      const uniquePlans = Array.from(new Map((data || []).map(p => [p.name, p])).values());
      setPlans(uniquePlans);
    } catch (err) {
      console.error("Plans error:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingPOS />;

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Plan Governance</h2>
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-1">Cross-Tenant Pricing Logic</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
         {plans.map((plan) => (
           <PlanCard key={plan.id} plan={plan} onUpdate={loadPlans} />
         ))}
      </div>
    </div>
  );
}

// --- 👥 4. BUSINESS OWNERS TABLE ---
export function OwnersPage() {
  const [owners, setOwners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetPasswordOwner, setResetPasswordOwner] = useState<any>(null);
  const { showToast } = useNotification();

  useEffect(() => {
    loadOwners();
  }, []);

  async function loadOwners() {
    try {
      setLoading(true);
      const data = await superAdminService.getBusinessOwners();
      setOwners(data);
    } catch (err) {
      console.error("Load owners error:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleResetPassword = async (owner: any) => {
    setResetPasswordOwner(owner);
  };

  if (loading) return <LoadingPOS />;

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50/50 border-b border-slate-100">
            <tr>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Administrator</th>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Business Node</th>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Identity</th>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Created</th>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {owners.map((owner) => (
              <tr key={owner.id} className="group hover:bg-slate-50/80 transition-all">
                <td className="px-8 py-6">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center">
                      <Shield size={20} />
                    </div>
                    <div>
                      <p className="font-black text-slate-900">{owner.full_name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Admin</p>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-6">
                  <span className="text-xs font-black text-primary uppercase tracking-wider">{owner.business?.name || "Global"}</span>
                </td>
                <td className="px-8 py-6 text-slate-600 text-sm font-medium">{owner.email}</td>
                <td className="px-8 py-6 text-slate-400 text-xs">{new Date(owner.created_at).toLocaleDateString()}</td>
                <td className="px-8 py-6 text-right">
                  <button 
                    onClick={() => handleResetPassword(owner)}
                    className="p-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                    title="Reset Password"
                  >
                    <Key size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {owners.length === 0 && (
          <div className="py-20 text-center text-slate-400 font-bold italic">No administrator accounts discovered.</div>
        )}
      </div>

      {resetPasswordOwner && (
        <ResetPasswordModal 
          owner={resetPasswordOwner} 
          onClose={() => setResetPasswordOwner(null)} 
        />
      )}
    </div>
  );
}

function DeleteBusinessModal({ business, onClose, onComplete }: any) {
  const [confirmName, setConfirmName] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { showToast } = useNotification();

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await superAdminService.exportBusinessDataCSV(business.id, business.name);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    if (confirmName !== business.name) return;
    setIsDeleting(true);
    try {
      await superAdminService.deleteBusiness(business.id);
      showToast("Business node completely wiped out successfully.", "success");
      onComplete();
    } catch (err: any) {
      showToast(err.message, "error");
      setIsDeleting(false);
    }
  };

  return (
    <Modal title="Delete Business Account" onClose={onClose}>
      <div className="space-y-6">
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-100 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-rose-500 text-white flex items-center justify-center animate-pulse">
            <Trash2 size={24} />
          </div>
          <div>
            <h4 className="text-sm font-black text-rose-900 uppercase">Extreme Caution</h4>
            <p className="text-xs font-bold text-rose-600">This action will permanently wipe all business data including Sales, Products, and Users.</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Optional: Backup Data</p>
          <button 
            onClick={handleExport}
            disabled={isExporting}
            className="w-full h-14 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center gap-3 text-slate-600 font-black text-[10px] uppercase tracking-widest hover:border-primary hover:text-primary transition-all active:scale-95"
          >
            {isExporting ? <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : "Download Files (CSV Bundle)"}
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Type "{business.name}" to confirm</p>
          <input 
            type="text" 
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            className="w-full h-14 px-6 rounded-2xl bg-slate-50 border border-slate-100 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            placeholder="Matching name required..."
          />
        </div>

        <button 
          onClick={handleDelete}
          disabled={confirmName !== business.name || isDeleting}
          className="w-full py-6 rounded-[2rem] bg-rose-600 text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-rose-200 disabled:opacity-50 disabled:grayscale transition-all active:scale-95"
        >
          {isDeleting ? "Wiping Node..." : "Destroy Business Permanent"}
        </button>
      </div>
    </Modal>
  );
}

function PlanCard({ plan, onUpdate }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ name: plan.name, price: plan.price });

  const handleSave = async () => {
    await superAdminService.updatePlan(plan.id, formData);
    setIsEditing(false);
    onUpdate();
  };

  return (
    <>
      <div className="group relative overflow-hidden rounded-[3rem] bg-white border border-slate-200 p-10 hover:shadow-2xl hover:border-primary/20 transition-all text-ink">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Duration Control</p>
        <h3 className="text-3xl font-black text-slate-900 mb-8 tracking-tighter">{plan.name}</h3>
        
        <div className="space-y-4 mb-10">
           <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase">Pricing Tier</span>
              <span className="text-lg font-black text-slate-900">{Number(plan.price).toLocaleString()} RWF</span>
           </div>
           <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase">Users Max</span>
              <span className="text-sm font-black text-slate-900">{plan.max_users || 'Unlimited'}</span>
           </div>
        </div>

        <button 
          onClick={() => setIsEditing(true)}
          className="w-full py-5 rounded-[2rem] bg-slate-50 border border-slate-100 font-black text-[10px] uppercase tracking-widest text-slate-400 group-hover:bg-slate-950 group-hover:text-white transition-all active:scale-95 shadow-lg shadow-slate-900/5"
        >
          Edit Plan Logic
        </button>
      </div>

      {isEditing && (
        <Modal title={`Edit Plan: ${plan.name}`} onClose={() => setIsEditing(false)}>
           <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Primary Label</p>
                <input 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full h-14 px-6 rounded-2xl bg-slate-50 border border-slate-100 font-bold"
                />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Price (Monthly)</p>
                <input 
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: Number(e.target.value)})}
                  className="w-full h-14 px-6 rounded-2xl bg-slate-50 border border-slate-100 font-bold"
                />
              </div>
              <button onClick={handleSave} className="w-full py-5 rounded-[2rem] bg-slate-950 text-white font-black text-[10px] uppercase tracking-widest">Update Plan Global</button>
           </div>
        </Modal>
      )}
    </>
  );
}

function ResetPasswordModal({ owner, onClose }: any) {
  const [password, setPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const { showToast } = useNotification();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      showToast("Password must be at least 6 characters long.", "warning");
      return;
    }

    setIsUpdating(true);
    try {
      await superAdminService.resetUserPassword(owner.auth_user_id, password);
      showToast("Password Overwritten & Secured!", "success");
      onClose();
    } catch (err: any) {
      showToast(err.message || "Failed to update password", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Modal title="Overwrite Administrator Auth" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="p-6 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Key size={24} />
          </div>
          <div>
            <h4 className="text-sm font-black text-indigo-900 uppercase tracking-tight">{owner.full_name}</h4>
            <p className="text-xs font-bold text-indigo-600">{owner.email}</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">New Security Key</p>
          <div className="relative">
             <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
             <input 
               type="text" 
               required
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               className="w-full h-14 pl-12 pr-6 rounded-2xl bg-slate-50 border border-slate-100 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
               placeholder="Enter new 6+ char password"
             />
          </div>
        </div>

        <button 
          type="submit"
          disabled={isUpdating || password.length < 6}
          className="w-full py-6 rounded-[2rem] bg-indigo-600 text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-200 disabled:opacity-50 disabled:grayscale transition-all active:scale-95"
        >
          {isUpdating ? "Transmitting..." : "Apply Global Override"}
        </button>
      </form>
    </Modal>
  );
}
