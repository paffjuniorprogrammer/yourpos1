import React, { useEffect, useState } from "react";
import { 
  Users, 
  Search, 
  Shield, 
  Mail, 
  Building2, 
  MoreVertical, 
  Calendar,
  UserCheck,
  UserX,
  Key
} from "lucide-react";
import { superAdminService } from "../../services/superAdminService";
import { LoadingPOS } from "../../components/ui/LoadingPOS";

export function GlobalUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      setLoading(true);
      const data = await superAdminService.getAllGlobalUsers();
      setUsers(data);
    } catch (err) {
      console.error("Failed to fetch global users:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleResetPassword = async (user: any) => {
    if (!user.auth_user_id) {
      alert("This user does not have a linked authentication account.");
      return;
    }

    const newPassword = window.prompt(`Enter new password for ${user.full_name}:`);
    if (!newPassword) return;

    if (newPassword.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }

    try {
      await superAdminService.resetUserPassword(user.auth_user_id, newPassword);
      alert("Password reset successfully! The user can now log in with the new password.");
    } catch (err: any) {
      console.error("Reset failed:", err);
      alert(`Failed to reset password: ${err.message || "Unknown error"}`);
    }
  };

  const handleToggleActive = async (user: any) => {
    // In a real app, this would call a service to toggle public.users.is_active
    console.log("Toggle active for user:", user.email);
  };

  const filtered = users.filter(u => 
    u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.business?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <LoadingPOS />;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Global User Monitoring</h1>
          <p className="text-slate-500 font-medium">Search and manage users across all business tenants.</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input 
          type="text"
          placeholder="Search by name, email, or business..."
          className="w-full rounded-2xl border-none bg-white py-4 pl-12 pr-4 shadow-sm outline-none ring-primary/20 transition-all focus:ring-4 placeholder:text-slate-400 font-medium"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((user) => (
          <div key={user.id} className="group overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm transition-all hover:shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl font-black text-white shadow-lg ${
                user.role === 'super_admin' ? 'bg-slate-900' : 
                user.role === 'admin' ? 'bg-primary' : 'bg-slate-200 text-slate-500 shadow-none'
              }`}>
                {user.full_name.charAt(0)}
              </div>
              <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                user.role === 'super_admin' ? 'bg-slate-900 text-white' : 
                user.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'
              }`}>
                {user.role}
              </span>
            </div>

            <div className="mb-6">
              <h3 className="text-xl font-black text-slate-900 leading-tight truncate">{user.full_name}</h3>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mt-1">
                <Mail size={12} />
                {user.email}
              </div>
            </div>

            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
                <Building2 size={14} className="text-slate-400" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">Business</p>
                  <p className="text-xs font-bold text-slate-700 truncate">{user.business?.name || 'Unassigned'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
                <Calendar size={14} className="text-slate-400" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">Joined</p>
                  <p className="text-xs font-bold text-slate-700">{new Date(user.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
               <button 
                onClick={() => handleToggleActive(user)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-colors ${
                  user.is_active ? 'bg-error/10 text-error hover:bg-error/20' : 'bg-success/10 text-success hover:bg-success/20'
                }`}
              >
                {user.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                {user.is_active ? 'Disable' : 'Enable'}
              </button>
              <button 
                onClick={() => handleResetPassword(user)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors" 
                title="Reset Password"
              >
                <Key size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
