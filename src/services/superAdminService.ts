import { supabase } from '../lib/supabase';
import type { BusinessRecord, UserProfile, BusinessStatus } from '../types/database';

export const superAdminService = {
  // --- Business Management ---
  async getAllBusinesses() {
    const { data, error } = await supabase
      .from('businesses')
      .select(`
        *,
        plan:subscription_plans(name),
        user_count:users(count),
        admins:users(auth_user_id, email, full_name, role)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return data?.map(biz => ({
      ...biz,
      owner: (biz as any).admins?.find((u: any) => u.role === 'admin') || (biz as any).admins?.[0]
    }));
  },

  async registerBusinessComplete(payload: {
    name: string;
    adminEmail: string;
    adminName: string;
    adminPassword?: string;
    planId: string;
    status: BusinessStatus;
    expiryDate: string;
  }) {
    // We use the RPC to ensure atomicity
    const { data, error } = await supabase.rpc('create_business_with_admin', {
        p_biz_name: payload.name,
        p_admin_email: payload.adminEmail,
        p_admin_password: payload.adminPassword || 'Password123',
        p_admin_name: payload.adminName,
        p_plan_id: payload.planId,
        p_status: payload.status as any,
        p_start_date: new Date().toISOString(),
        p_end_date: payload.expiryDate
    });

    if (error) throw error;
    return data;
  },

  async updateBusiness(id: string, updates: Partial<BusinessRecord>) {
    const { data, error } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteBusiness(id: string) {
    const { error } = await supabase.rpc('hard_delete_business', {
      p_biz_id: id
    });

    if (error) throw error;
  },

  async getBusinessExportData(businessId: string) {
    const [users, products, sales, customers, suppliers] = await Promise.all([
      supabase.from('users').select('*').eq('business_id', businessId),
      supabase.from('products').select('*').eq('business_id', businessId),
      supabase.from('sales').select('*').eq('business_id', businessId),
      supabase.from('customers').select('*').eq('business_id', businessId),
      supabase.from('suppliers').select('*').eq('business_id', businessId),
    ]);

    return {
      users: users.data || [],
      products: products.data || [],
      sales: sales.data || [],
      customers: customers.data || [],
      suppliers: suppliers.data || [],
    };
  },

  async getBusinessDetails(id: string) {
    const { data: business, error } = await supabase
      .from('businesses')
      .select(`
        *,
        plan:subscription_plans(*),
        users(
          id, full_name, email, role, is_active, created_at,
          locations(name)
        ),
        locations(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    const { data: stats } = await supabase.rpc('get_business_stats', { p_business_id: id });

    return {
      ...business,
      stats
    };
  },

  async extendSubscription(id: string, days: number, newPlanId?: string) {
    const { data: business } = await supabase
      .from('businesses')
      .select('subscription_end_date, status')
      .eq('id', id)
      .single();

    const currentEnd = business?.subscription_end_date ? new Date(business.subscription_end_date) : new Date();
    const now = new Date();
    
    if (currentEnd < now) {
      currentEnd.setDate(now.getDate() + days);
    } else {
      currentEnd.setDate(currentEnd.getDate() + days);
    }

    const updates: any = {
      subscription_end_date: currentEnd.toISOString(),
      status: 'active'
    };

    if (newPlanId) {
      updates.plan_id = newPlanId;
    }

    const { data, error } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async exportBusinessDataCSV(businessId: string, businessName: string) {
    const data = await this.getBusinessExportData(businessId);
    
    const timestamp = new Date().toISOString().split('T')[0];
    const prefix = businessName.replace(/\s+/g, '_');

    // Helper to generate and download CSV
    const downloadCSV = (tableName: string, rows: any[]) => {
      if (!rows || rows.length === 0) return;
      
      const headers = Object.keys(rows[0]);
      const csvContent = [
        headers.join(','),
        ...rows.map(row => headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val).replace(/"/g, '""');
          return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
        }).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${prefix}_${tableName}_${timestamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    // Download each main table as a separate CSV
    downloadCSV('users', data.users);
    downloadCSV('products', data.products);
    downloadCSV('sales', data.sales);
    downloadCSV('customers', data.customers);
    downloadCSV('suppliers', data.suppliers);
    
    return true;
  },

  // --- Subscription Controls ---
  async getSubscriptionPlans() {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;
    return data;
  },

  async updatePlan(planId: string, updates: { name: string; description?: string }) {
    const { error } = await supabase
      .from('subscription_plans')
      .update(updates)
      .eq('id', planId);
    
    if (error) throw error;
  },

  async quickExtendSubscription(id: string, currentEnd: string | null) {
    const date = currentEnd ? new Date(currentEnd) : new Date();
    date.setDate(date.getDate() + 30);
    
    return this.updateBusiness(id, { 
      subscription_end_date: date.toISOString(),
      status: 'active' // Ensure it reactivates if they were expired
    });
  },

  // --- User Monitoring ---
  async getAllGlobalUsers() {
    const { data, error } = await supabase
      .from('users')
      .select(`*, business:businesses(name)`)
      .order('email');

    if (error) throw error;
    return data;
  },

  async getBusinessOwners() {
    const { data, error } = await supabase
      .from('users')
      .select(`*, business:businesses(name)`)
      .eq('role', 'admin')
      .order('full_name');

    if (error) throw error;
    return data;
  },

  async resetUserPassword(targetAuthUserId: string, newPassword: string) {
    const { data, error } = await supabase.rpc('admin_reset_user_password', {
      p_target_auth_id: targetAuthUserId,
      p_new_password: newPassword
    });

    if (error) throw error;
    return data;
  },

  // --- Dashboard Data ---
  async getSystemWideStats() {
    const { data: bizCount } = await supabase.from('businesses').select('*', { count: 'exact', head: true });
    const { data: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { data: adminCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'admin');
    
    const { data: salesSum } = await supabase.rpc('get_global_sales_total');

    return {
      totalBusinesses: bizCount || 0,
      totalUsers: userCount || 0,
      totalAdmins: adminCount || 0,
      globalGmv: salesSum || 0
    };
  },

  // --- Audit Logs ---
  async getGlobalAuditLogs(limit: number = 100) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*, business:businesses(name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }
};
