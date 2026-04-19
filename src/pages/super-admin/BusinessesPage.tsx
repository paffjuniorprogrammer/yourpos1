import React, { useEffect, useState } from "react";
import { 
  Building2, 
  Search, 
  Calendar, 
  Users, 
  ShoppingBag, 
  Power,
  Plus,
  Key,
  Download,
  Trash2,
  X,
  CreditCard,
  Clock,
  Shield,
  Eye
} from "lucide-react";
import { superAdminService } from "../../services/superAdminService";
import { LoadingPOS } from "../../components/ui/LoadingPOS";
import { useNotification } from "../../context/NotificationContext";
import type { BusinessRecord } from "../../types/database";

export function BusinessesPage() {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [newBiz, setNewBiz] = useState({ name: "", planId: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, showToast } = useNotification();

  const [selectedBusiness, setSelectedBusiness] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [extending, setExtending] = useState(false);
  const [extendDays, setExtendDays] = useState(30);
  const [changePlanId, setChangePlanId] = useState("");

  useEffect(() => {
    fetchBusinesses();
    fetchPlans();
  }, []);

  async function fetchPlans() {
    try {
      const data = await superAdminService.getSubscriptionPlans();
      setPlans(data);
      if (data.length > 0) {
        setNewBiz(prev => ({ ...prev, planId: data[0].id }));
        setChangePlanId(data[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch plans:", err);
    }
  }

  async function fetchBusinesses() {
    try {
      setLoading(true);
      const data = await superAdminService.getAllBusinesses();
      setBusinesses(data);
    } catch (err: any) {
      console.error("Failed to fetch businesses:", err);
      setError(err.message || "Failed to load businesses. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  const handleCreateBusiness = async () => {
    if (!newBiz.name || !newBiz.planId) return;
    try {
      setCreating(true);
      await superAdminService.registerBusinessComplete({
        name: newBiz.name,
        adminEmail: `${newBiz.name.toLowerCase().replace(/\s+/g, '')}@admin.local`,
        adminName: "Admin",
        planId: newBiz.planId,
        status: "active",
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
      setShowCreateModal(false);
      setNewBiz({ name: "", planId: plans[0]?.id || "" });
      fetchBusinesses();
      showToast("success", "Business created successfully!");
    } catch (err: any) {
      console.error("Creation failed:", err);
      showToast("error", err.message || "Failed to create business");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (biz: any) => {
    const newStatus = biz.status === 'active' ? 'suspended' : 'active';
    const action = newStatus === 'suspended' ? 'suspend' : 'activate';
    
    const confirmed = await confirm(
      `${action === 'suspend' ? 'Suspend' : 'Activate'} Business`,
      `Are you sure you want to ${action} "${biz.name}"? ${newStatus === 'suspended' ? 'All users will be locked out immediately.' : 'Users will regain access.'}`
    );
    
    if (!confirmed) return;
    
    try {
      await superAdminService.updateBusiness(biz.id, { status: newStatus });
      fetchBusinesses();
      showToast("success", `Business ${newStatus === 'active' ? 'activated' : 'suspended'} successfully!`);
    } catch (err: any) {
      console.error("Update failed:", err);
      showToast("error", err.message || "Failed to update business status");
    }
  };

  const handleResetOwnerPassword = async (biz: any) => {
    const owner = biz.owner;
    if (!owner || !owner.auth_user_id) {
      showToast("error", "No administrator found for this business.");
      return;
    }

    const newPassword = window.prompt(`Set new password for ${owner.full_name} (${owner.email}):`);
    if (!newPassword) return;

    if (newPassword.length < 6) {
      showToast("error", "Password must be at least 6 characters long.");
      return;
    }

    try {
      await superAdminService.resetUserPassword(owner.auth_user_id, newPassword);
      showToast("success", `Password for ${owner.full_name} has been reset!`);
    } catch (err: any) {
      console.error("Reset failed:", err);
      showToast("error", err.message || "Failed to reset password");
    }
  };

  const handleDeleteBusiness = async (biz: any) => {
    const confirmed = await confirm(
      "Delete Business",
      `Are you sure you want to permanently delete "${biz.name}"? This will remove ALL data including users, products, sales, and customers. This action CANNOT be undone!`
    );
    
    if (!confirmed) return;

    try {
      await superAdminService.deleteBusiness(biz.id);
      fetchBusinesses();
      showToast("success", "Business deleted successfully!");
    } catch (err: any) {
      console.error("Delete failed:", err);
      showToast("error", err.message || "Failed to delete business");
    }
  };

  const handleExportData = async (biz: any) => {
    try {
      showToast("info", "Preparing export...");
      await superAdminService.exportBusinessDataCSV(biz.id, biz.name);
      showToast("success", "Data exported successfully!");
    } catch (err: any) {
      console.error("Export failed:", err);
      showToast("error", err.message || "Failed to export data");
    }
  };

  const handleViewDetails = async (biz: any) => {
    setSelectedBusiness(biz);
    setShowDetailsModal(true);
    setDetailsLoading(true);
    
    try {
      const details = await superAdminService.getBusinessDetails(biz.id);
      setSelectedBusiness(details);
    } catch (err: any) {
      console.error("Failed to load details:", err);
      showToast("error", "Failed to load business details");
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleExtendSubscription = async () => {
    if (!selectedBusiness) return;
    
    setExtending(true);
    try {
      await superAdminService.extendSubscription(selectedBusiness.id, extendDays, changePlanId || undefined);
      showToast("success", `Subscription extended by ${extendDays} days!`);
      setShowSubscriptionModal(false);
      fetchBusinesses();
      
      const updated = await superAdminService.getBusinessDetails(selectedBusiness.id);
      setSelectedBusiness(updated);
    } catch (err: any) {
      console.error("Extend failed:", err);
      showToast("error", err.message || "Failed to extend subscription");
    } finally {
      setExtending(false);
    }
  };

  const filtered = businesses.filter(b => 
    b.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <LoadingPOS />;

  if (error) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-slate-200 p-12 text-center">
        <div className="mb-4 rounded-2xl bg-rose-50 p-4 text-rose-500">
          <Power size={32} />
        </div>
        <h3 className="text-xl font-black text-slate-900">Connection Error</h3>
        <p className="mb-6 text-slate-500 max-w-xs">{error}</p>
        <button 
          onClick={fetchBusinesses}
          className="rounded-xl bg-slate-900 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-transform active:scale-95"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Business Management</h1>
          <p className="text-slate-500 font-medium">Create, monitor, and control all tenant businesses.</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-4 font-bold text-white shadow-2xl transition-all hover:scale-[1.02] active:scale-[0.98] ring-4 ring-slate-950/10"
        >
          <Plus size={20} />
          Create New Business
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input 
          type="text"
          placeholder="Search businesses by name..."
          className="w-full rounded-2xl border-none bg-white py-4 pl-12 pr-4 shadow-sm outline-none ring-blue-500/20 transition-all focus:ring-4 placeholder:text-slate-400 font-medium"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((biz) => (
          <div key={biz.id} className="group relative overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1">
            <div className="absolute right-8 top-8">
              <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                biz.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 
                biz.status === 'suspended' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
              }`}>
                {biz.status}
              </span>
            </div>

            <div className="flex items-center gap-4 mb-8">
              <button 
                onClick={() => handleViewDetails(biz)}
                className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-white font-black text-2xl shadow-lg ring-4 ring-slate-100 hover:ring-blue-300 transition-all"
              >
                {biz.name.charAt(0)}
              </button>
              <div>
                <h3 className="text-xl font-black text-slate-900 leading-tight">{biz.name}</h3>
                <p className="text-xs text-slate-400 font-bold tracking-widest uppercase mt-1">{biz.plan?.name || "No Plan"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                  <Users size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Users</span>
                </div>
                <p className="text-lg font-black text-slate-900">{biz.user_count?.[0]?.count || 0}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                  <ShoppingBag size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Products</span>
                </div>
                <p className="text-lg font-black text-slate-900">{biz.product_count?.[0]?.count || 0}</p>
              </div>
            </div>

            <div className="mb-8">
              <div className="flex items-center justify-between text-xs font-bold mb-2">
                <span className="text-slate-400 uppercase tracking-wider">Subscription Expiry</span>
                <span className="text-blue-600">{biz.subscription_end_date ? new Date(biz.subscription_end_date).toLocaleDateString() : '—'}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: '65%' }} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => handleToggleStatus(biz)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-colors ${
                  biz.status === 'active' ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                }`}
              >
                <Power size={14} />
                {biz.status === 'active' ? 'Suspend' : 'Activate'}
              </button>
              <button 
                onClick={() => handleResetOwnerPassword(biz)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                title="Reset Owner Password"
              >
                <Key size={16} />
              </button>
              <button 
                onClick={() => handleExportData(biz)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                title="Export Data"
              >
                <Download size={16} />
              </button>
              <button 
                onClick={() => handleViewDetails(biz)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                title="View Details"
              >
                <Eye size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
           <div className="w-full max-w-lg rounded-[2.5rem] bg-white p-10 shadow-2xl animate-in zoom-in-95 duration-200">
               <h2 className="text-2xl font-black text-slate-900 mb-2">Register New Business</h2>
               <p className="text-slate-500 mb-8 font-medium">Set up a new tenant on the platform.</p>
               
               <div className="space-y-6">
                 <div>
                   <label className="block text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Business Name</label>
                   <input 
                     type="text" 
                     className="w-full rounded-2xl bg-slate-50 border-none p-4 font-semibold outline-none ring-blue-500/20 focus:ring-4" 
                     placeholder="Eagle Supermarket" 
                     value={newBiz.name}
                     onChange={(e) => setNewBiz({ ...newBiz, name: e.target.value })}
                   />
                 </div>
                 <div>
                   <label className="block text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Initial Plan</label>
                   <select 
                     className="w-full rounded-2xl bg-slate-50 border-none p-4 font-semibold outline-none ring-blue-500/20 focus:ring-4 appearance-none"
                     value={newBiz.planId}
                     onChange={(e) => setNewBiz({ ...newBiz, planId: e.target.value })}
                   >
                     {plans.map(p => (
                       <option key={p.id} value={p.id}>{p.name} (${p.price_monthly}/mo)</option>
                     ))}
                   </select>
                 </div>
               </div>

               <div className="flex gap-4 mt-10">
                 <button onClick={() => setShowCreateModal(false)} className="flex-1 rounded-2xl bg-slate-100 py-4 font-bold text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
                 <button 
                   onClick={handleCreateBusiness}
                   disabled={creating || !newBiz.name}
                   className="flex-1 rounded-2xl bg-slate-950 py-4 font-bold text-white shadow-lg active:scale-95 transition-transform disabled:opacity-50"
                 >
                   {creating ? "Creating..." : "Create Business"}
                 </button>
               </div>
          </div>
        </div>
      )}

      {showDetailsModal && selectedBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-[2.5rem] bg-white shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-950 text-white font-black text-xl shadow-lg">
                    {selectedBusiness.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">{selectedBusiness.name}</h2>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                      selectedBusiness.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 
                      selectedBusiness.status === 'suspended' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      {selectedBusiness.status}
                    </span>
                  </div>
                </div>
                <button onClick={() => setShowDetailsModal(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                  <X size={20} />
                </button>
              </div>

              {detailsLoading ? (
                <div className="py-12 text-center text-slate-500">Loading details...</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Plan</p>
                      <p className="text-lg font-black text-slate-900 mt-1">{selectedBusiness.plan?.name || 'No Plan'}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Expires</p>
                      <p className="text-lg font-black text-slate-900 mt-1">
                        {selectedBusiness.subscription_end_date 
                          ? new Date(selectedBusiness.subscription_end_date).toLocaleDateString()
                          : 'N/A'
                        }
                      </p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 mb-3">Team Members ({selectedBusiness.users?.length || 0})</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedBusiness.users?.map((user: any) => (
                        <div key={user.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                              {user.full_name?.charAt(0) || 'U'}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{user.full_name}</p>
                              <p className="text-xs text-slate-500">{user.email}</p>
                            </div>
                          </div>
                          <span className="text-xs font-bold uppercase bg-slate-200 px-2 py-1 rounded-lg">{user.role}</span>
                        </div>
                      )) || <p className="text-sm text-slate-500">No users found</p>}
                    </div>
                  </div>

                  <div className="flex gap-3 flex-wrap">
                    <button 
                      onClick={() => {
                        setChangePlanId(selectedBusiness.plan_id || plans[0]?.id || "");
                        setShowSubscriptionModal(true);
                      }}
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-4 py-3 text-sm font-bold text-white hover:bg-blue-600 transition-colors"
                    >
                      <CreditCard size={16} />
                      Manage Subscription
                    </button>
                    <button 
                      onClick={() => handleExportData(selectedBusiness)}
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-600 hover:bg-emerald-100 transition-colors"
                    >
                      <Download size={16} />
                      Export Data
                    </button>
                    <button 
                      onClick={() => {
                        setShowDetailsModal(false);
                        handleToggleStatus(selectedBusiness);
                      }}
                      className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-colors ${
                        selectedBusiness.status === 'active' 
                          ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                          : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                      }`}
                    >
                      <Power size={16} />
                      {selectedBusiness.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                    <button 
                      onClick={() => handleDeleteBusiness(selectedBusiness)}
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600 hover:bg-rose-100 transition-colors"
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showSubscriptionModal && selectedBusiness && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[2.5rem] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-900">Manage Subscription</h2>
              <button onClick={() => setShowSubscriptionModal(false)} className="rounded-full bg-slate-100 p-2 text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Extend By</label>
                <select 
                  value={extendDays}
                  onChange={(e) => setExtendDays(Number(e.target.value))}
                  className="w-full rounded-2xl bg-slate-50 border-none p-4 font-semibold outline-none"
                >
                  <option value={7}>7 Days</option>
                  <option value={14}>14 Days</option>
                  <option value={30}>30 Days</option>
                  <option value={60}>60 Days</option>
                  <option value={90}>90 Days</option>
                  <option value={365}>1 Year</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Change Plan</label>
                <select 
                  value={changePlanId}
                  onChange={(e) => setChangePlanId(e.target.value)}
                  className="w-full rounded-2xl bg-slate-50 border-none p-4 font-semibold outline-none"
                >
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (${p.price_monthly}/mo)</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setShowSubscriptionModal(false)} className="flex-1 rounded-2xl bg-slate-100 py-3 font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
              <button 
                onClick={handleExtendSubscription}
                disabled={extending}
                className="flex-1 rounded-2xl bg-blue-500 py-3 font-bold text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {extending ? "Processing..." : "Apply Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
