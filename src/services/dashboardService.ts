import { ensureSupabaseConfigured } from "./supabaseUtils";
import { supabase } from "../lib/supabase";

export type DashboardStat = {
  title: string;
  value: string;
  meta: string;
};

export type SalesTrendItem = {
  label: string;
  value: number;
};

export type RecentTransaction = {
  id: string;
  customer: string;
  total: string;
  cashier: string;
  time: string;
};

export type UnpaidItem = {
  id: string;
  name: string;
  amount: string;
  date: string;
};

export type FinanceOverview = {
  salesToday: number;
  salesMonth: number;
  salesYear: number;
  purchasesTotal: number;
  supplierDue: number;
  supplierPaid: number;
  customerUnpaid: number;
  taxEstimation: number;
};

// Simple in-memory cache for dashboard data to prevent redundant reloads
let statsCache: { key: string, data: DashboardStat[], timestamp: number } | null = null;
let trendCache: { key: string, data: SalesTrendItem[], timestamp: number } | null = null;
let transactionsCache: { key: string, data: RecentTransaction[], timestamp: number } | null = null;
const CACHE_DURATION_MS = 30000; // 30 seconds
let unpaidCustomersCache: { key: string, data: UnpaidItem[], timestamp: number } | null = null;
let unpaidSuppliersCache: { key: string, data: UnpaidItem[], timestamp: number } | null = null;
let financeCache: { key: string, data: FinanceOverview, timestamp: number } | null = null;

async function getEffectiveBusinessId(explicitBizId?: string): Promise<string | null> {
  if (explicitBizId) return explicitBizId;
  try {
    const cached = localStorage.getItem("cached_user_profile");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.business_id) return parsed.business_id;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      const { data: user } = await supabase
        .from("users")
        .select("business_id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (user?.business_id) return user.business_id;
    }
  } catch (e) {
    console.warn("Failed to resolve business ID:", e);
  }
  return null;
}

/**
 * Force-clears all dashboard caches to trigger a fresh data fetch.
 * Used for real-time synchronization when remote updates are detected.
 */
export function clearDashboardCaches() {
  statsCache = null;
  trendCache = null;
  transactionsCache = null;
  unpaidCustomersCache = null;
  unpaidSuppliersCache = null;
  financeCache = null;
}

const DEMO_DASHBOARD_STATS: DashboardStat[] = [
  { title: "Total Sales", value: "252,000 RWF", meta: "Today (Demo)" },
  { title: "Revenue", value: "4,850,000 RWF", meta: "This month (Demo)" },
  { title: "Unpaid Suppliers", value: "320,000 RWF", meta: "Owed to suppliers" },
  { title: "Unpaid Customers", value: "185,000 RWF", meta: "Owed by customers" },
  { title: "Products Sold", value: "42", meta: "Today" },
  { title: "Low Stock Alerts", value: "3", meta: "Items need restocking" },
];

const DEMO_SALES_TREND: SalesTrendItem[] = [
  { label: "Mon", value: 3400 },
  { label: "Tue", value: 4100 },
  { label: "Wed", value: 2900 },
  { label: "Thu", value: 5200 },
  { label: "Fri", value: 6800 },
  { label: "Sat", value: 8500 },
  { label: "Sun", value: 4900 },
];

const DEMO_RECENT_TRANSACTIONS: RecentTransaction[] = [
  { id: "SAL-DEMO-891", customer: "Jean Paul Ndayisaba", total: "14,500 RWF", cashier: "Demo Store Admin", time: "12:45" },
  { id: "SAL-DEMO-890", customer: "Walk-in Customer", total: "8,500 RWF", cashier: "Demo Store Admin", time: "11:30" },
  { id: "SAL-DEMO-889", customer: "Marie Claire Uwase", total: "22,000 RWF", cashier: "Demo Store Admin", time: "10:15" },
  { id: "SAL-DEMO-888", customer: "Eric Mugisha (VIP)", total: "45,000 RWF", cashier: "Demo Store Admin", time: "09:50" },
  { id: "SAL-DEMO-887", customer: "Walk-in Customer", total: "3,500 RWF", cashier: "Demo Store Admin", time: "09:10" },
];

const DEMO_UNPAID_CUSTOMERS: UnpaidItem[] = [
  { id: "demo-debt-1", name: "Eric Mugisha", amount: "120,000 RWF", date: "2026-08-25" },
  { id: "demo-debt-2", name: "Jean Paul Ndayisaba", amount: "65,000 RWF", date: "2026-08-27" },
];

const DEMO_UNPAID_SUPPLIERS: UnpaidItem[] = [
  { id: "demo-sup-debt-1", name: "Inyange Industries Ltd", amount: "200,000 RWF", date: "2026-08-20" },
  { id: "demo-sup-debt-2", name: "Bakhresa Grain Millers", amount: "120,000 RWF", date: "2026-08-22" },
];

export async function getDashboardStats(forceRefresh = false, businessId?: string): Promise<DashboardStat[]> {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_DASHBOARD_STATS;
  }
  const bizId = await getEffectiveBusinessId(businessId);
  const cacheKey = `stats_${bizId || 'all'}`;
  const now = Date.now();
  if (!forceRefresh && statsCache && statsCache.key === cacheKey && now - statsCache.timestamp < CACHE_DURATION_MS) {
    return statsCache.data;
  }

  const client = await ensureSupabaseConfigured();

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  // Get total sales for today
  let todaySalesQuery = client
    .from('sales')
    .select('total_amount')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .lt('created_at', `${today}T23:59:59.999Z`);

  if (bizId) todaySalesQuery = todaySalesQuery.eq('business_id', bizId);

  const { data: todaySales, error: salesError } = await todaySalesQuery;
  if (salesError) throw salesError;
  let totalSalesToday = todaySales?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;

  // Subtract today's completed refunds
  let todayReturnsQuery = client
    .from('sale_returns')
    .select('refund_amount')
    .eq('status', 'completed')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .lt('created_at', `${today}T23:59:59.999Z`);

  if (bizId) todayReturnsQuery = todayReturnsQuery.eq('business_id', bizId);

  const { data: todayReturns } = await todayReturnsQuery;
  const todaysRefund = todayReturns?.reduce((sum, r) => sum + Number(r.refund_amount), 0) || 0;
  totalSalesToday -= todaysRefund;

  // Get total revenue for current month
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  let monthSalesQuery = client
    .from('sales')
    .select('total_amount')
    .gte('created_at', `${currentMonth}-01T00:00:00.000Z`);

  if (bizId) monthSalesQuery = monthSalesQuery.eq('business_id', bizId);

  const { data: monthSales, error: monthError } = await monthSalesQuery;
  if (monthError) throw monthError;
  let totalRevenue = monthSales?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;

  // Subtract this month's completed refunds
  let monthReturnsQuery = client
    .from('sale_returns')
    .select('refund_amount')
    .eq('status', 'completed')
    .gte('created_at', `${currentMonth}-01T00:00:00.000Z`);

  if (bizId) monthReturnsQuery = monthReturnsQuery.eq('business_id', bizId);

  const { data: monthReturns } = await monthReturnsQuery;
  const monthRefund = monthReturns?.reduce((sum, r) => sum + Number(r.refund_amount), 0) || 0;
  totalRevenue -= monthRefund;

  // Get products sold today (sum of quantities from sale_items)
  let todayItemsQuery = client
    .from('sale_items')
    .select('quantity, sales!inner(created_at, business_id)')
    .gte('sales.created_at', `${today}T00:00:00.000Z`)
    .lt('sales.created_at', `${today}T23:59:59.999Z`);

  if (bizId) todayItemsQuery = todayItemsQuery.eq('sales.business_id', bizId);

  const { data: todayItems, error: itemsError } = await todayItemsQuery;
  if (itemsError) throw itemsError;

  const productsSold = todayItems?.reduce((sum, item) => sum + Number(item.quantity), 0) || 0;

  // Get low stock alerts (products below reorder level for this business)
  let productsQuery = client
    .from('products')
    .select('stock_quantity, reorder_level')
    .eq('is_active', true);

  if (bizId) productsQuery = productsQuery.eq('business_id', bizId);

  const { data: products, error: stockError } = await productsQuery;
  if (stockError) throw stockError;

  const lowStockCount = products?.filter(p => (p.stock_quantity || 0) < (p.reorder_level || 0)).length || 0;

  // Get Unpaid Suppliers total (Purchases not fully paid)
  let unpaidPurchasesQuery = client
    .from('purchases')
    .select('total_cost')
    .neq('payment_status', 'paid');

  if (bizId) unpaidPurchasesQuery = unpaidPurchasesQuery.eq('business_id', bizId);

  const { data: unpaidPurchases, error: unpaidPurchasesError } = await unpaidPurchasesQuery;
  if (unpaidPurchasesError) throw unpaidPurchasesError;
  const totalUnpaidSuppliers = unpaidPurchases?.reduce((sum, p) => sum + Number(p.total_cost), 0) || 0;

  // Get Unpaid Customers total (Sales not fully paid)
  let unpaidSalesQuery = client
    .from('sales')
    .select('total_amount')
    .neq('payment_status', 'paid');

  if (bizId) unpaidSalesQuery = unpaidSalesQuery.eq('business_id', bizId);

  const { data: unpaidSales, error: unpaidSalesError } = await unpaidSalesQuery;
  if (unpaidSalesError) throw unpaidSalesError;
  const totalUnpaidCustomers = unpaidSales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;

  const rwf = (val: number) => `${Math.round(val).toLocaleString()} RWF`;

  const result = [
    {
      title: "Total Sales",
      value: rwf(totalSalesToday),
      meta: "Today"
    },
    {
      title: "Revenue",
      value: rwf(totalRevenue),
      meta: "This month"
    },
    {
      title: "Unpaid Suppliers",
      value: rwf(totalUnpaidSuppliers),
      meta: "Owed to suppliers"
    },
    {
      title: "Unpaid Customers",
      value: rwf(totalUnpaidCustomers),
      meta: "Owed by customers"
    },
    {
      title: "Products Sold",
      value: productsSold.toString(),
      meta: "Today"
    },
    {
      title: "Low Stock Alerts",
      value: lowStockCount.toString(),
      meta: "Items need restocking"
    }
  ];

  statsCache = { key: cacheKey, data: result, timestamp: Date.now() };
  return result;
}

export async function getSalesTrend(businessId?: string): Promise<SalesTrendItem[]> {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_SALES_TREND;
  }
  const bizId = await getEffectiveBusinessId(businessId);
  const cacheKey = `trend_${bizId || 'all'}`;
  const now = Date.now();
  if (trendCache && trendCache.key === cacheKey && now - trendCache.timestamp < CACHE_DURATION_MS) {
    return trendCache.data;
  }
  const client = await ensureSupabaseConfigured();

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push(date);
  }

  const startDate = `${days[0].toISOString().split('T')[0]}T00:00:00.000Z`;
  const endDate = `${days[6].toISOString().split('T')[0]}T23:59:59.999Z`;

  let salesQuery = client
    .from('sales')
    .select('total_amount, created_at')
    .gte('created_at', startDate)
    .lt('created_at', endDate);

  if (bizId) salesQuery = salesQuery.eq('business_id', bizId);

  const { data: sales, error } = await salesQuery;
  if (error) throw error;

  const trendData: SalesTrendItem[] = [];

  for (const date of days) {
    const dateStr = date.toISOString().split('T')[0];
    const daySales = sales?.filter(sale => sale.created_at.startsWith(dateStr)) || [];
    const total = daySales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

    trendData.push({
      label: dayName,
      value: Math.round(total / 100)
    });
  }

  trendCache = { key: cacheKey, data: trendData, timestamp: Date.now() };
  return trendData;
}

export async function getRecentTransactions(businessId?: string): Promise<RecentTransaction[]> {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_RECENT_TRANSACTIONS;
  }
  const bizId = await getEffectiveBusinessId(businessId);
  const cacheKey = `transactions_${bizId || 'all'}`;
  const now = Date.now();
  if (transactionsCache && transactionsCache.key === cacheKey && now - transactionsCache.timestamp < CACHE_DURATION_MS) {
    return transactionsCache.data;
  }
  const client = await ensureSupabaseConfigured();

  let query = client
    .from('sales')
    .select(`
      id,
      sale_number,
      total_amount,
      created_at,
      customers(full_name),
      users!sales_cashier_id_fkey(full_name)
    `);

  if (bizId) query = query.eq('business_id', bizId);

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) throw error;

  const result: RecentTransaction[] = (data || []).map((sale: any) => ({
    id: sale.sale_number,
    customer: sale.customers?.full_name || 'Walk-in Customer',
    total: `${Math.round(Number(sale.total_amount)).toLocaleString()} RWF`,
    cashier: sale.users?.full_name || 'Unknown',
    time: new Date(sale.created_at).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }));

  transactionsCache = { key: cacheKey, data: result, timestamp: Date.now() };
  return result;
}

export async function getUnpaidCustomers(businessId?: string): Promise<UnpaidItem[]> {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_UNPAID_CUSTOMERS;
  }
  const bizId = await getEffectiveBusinessId(businessId);
  const cacheKey = `unpaid_cust_${bizId || 'all'}`;
  const now = Date.now();
  if (unpaidCustomersCache && unpaidCustomersCache.key === cacheKey && now - unpaidCustomersCache.timestamp < CACHE_DURATION_MS) {
    return unpaidCustomersCache.data;
  }
  const client = await ensureSupabaseConfigured();

  let query = client
    .from('sales')
    .select(`
      id,
      sale_number,
      total_amount,
      created_at,
      customers(full_name)
    `)
    .neq('payment_status', 'paid');

  if (bizId) query = query.eq('business_id', bizId);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;

  const result: UnpaidItem[] = (data || []).map((sale: any) => ({
    id: sale.id,
    name: sale.customers?.full_name || 'Walk-in Customer',
    amount: `${Math.round(Number(sale.total_amount)).toLocaleString()} RWF`,
    date: new Date(sale.created_at).toLocaleDateString()
  }));

  unpaidCustomersCache = { key: cacheKey, data: result, timestamp: Date.now() };
  return result;
}

export async function getUnpaidSuppliers(businessId?: string): Promise<UnpaidItem[]> {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_UNPAID_SUPPLIERS;
  }
  const bizId = await getEffectiveBusinessId(businessId);
  const cacheKey = `unpaid_supp_${bizId || 'all'}`;
  const now = Date.now();
  if (unpaidSuppliersCache && unpaidSuppliersCache.key === cacheKey && now - unpaidSuppliersCache.timestamp < CACHE_DURATION_MS) {
    return unpaidSuppliersCache.data;
  }
  const client = await ensureSupabaseConfigured();

  let query = client
    .from('purchases')
    .select(`
      id,
      total_cost,
      purchase_date,
      suppliers(name)
    `)
    .neq('payment_status', 'paid');

  if (bizId) query = query.eq('business_id', bizId);

  const { data, error } = await query.order('purchase_date', { ascending: false });

  if (error) throw error;

  const result: UnpaidItem[] = (data || []).map((purchase: any) => ({
    id: purchase.id,
    name: purchase.suppliers?.name || 'Unknown Supplier',
    amount: `${Math.round(Number(purchase.total_cost)).toLocaleString()} RWF`,
    date: new Date(purchase.purchase_date).toLocaleDateString()
  }));

  unpaidSuppliersCache = { key: cacheKey, data: result, timestamp: Date.now() };
  return result;
}

export async function getFinanceOverview(forceRefresh = false, businessId?: string): Promise<FinanceOverview> {
  const bizId = await getEffectiveBusinessId(businessId);
  const cacheKey = `finance_${bizId || 'all'}`;
  const now = Date.now();
  if (!forceRefresh && financeCache && financeCache.key === cacheKey && now - financeCache.timestamp < CACHE_DURATION_MS * 2) {
    return financeCache.data;
  }
  const client = await ensureSupabaseConfigured();
  
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentYear = new Date().getFullYear().toString();

  let sTodayQ = client.from('sales').select('total_amount').gte('created_at', `${today}T00:00:00.000Z`);
  let sMonthQ = client.from('sales').select('total_amount').gte('created_at', `${currentMonth}-01T00:00:00.000Z`);
  let sYearQ = client.from('sales').select('total_amount').gte('created_at', `${currentYear}-01-01T00:00:00.000Z`);
  let rTodayQ = client.from('sale_returns').select('refund_amount').eq('status', 'completed').gte('created_at', `${today}T00:00:00.000Z`);
  let rMonthQ = client.from('sale_returns').select('refund_amount').eq('status', 'completed').gte('created_at', `${currentMonth}-01T00:00:00.000Z`);
  let rYearQ = client.from('sale_returns').select('refund_amount').eq('status', 'completed').gte('created_at', `${currentYear}-01-01T00:00:00.000Z`);
  let purQ = client.from('purchases').select('total_cost, payment_status');
  let purPayQ = client.from('purchase_payments').select('amount');
  let unpSalesQ = client.from('sales').select('total_amount').neq('payment_status', 'paid');
  let settingsQ = client.from('shop_settings').select('tax_percentage');

  if (bizId) {
    sTodayQ = sTodayQ.eq('business_id', bizId);
    sMonthQ = sMonthQ.eq('business_id', bizId);
    sYearQ = sYearQ.eq('business_id', bizId);
    rTodayQ = rTodayQ.eq('business_id', bizId);
    rMonthQ = rMonthQ.eq('business_id', bizId);
    rYearQ = rYearQ.eq('business_id', bizId);
    purQ = purQ.eq('business_id', bizId);
    unpSalesQ = unpSalesQ.eq('business_id', bizId);
    settingsQ = settingsQ.eq('business_id', bizId);
  }

  const [
    { data: salesToday },
    { data: salesMonth },
    { data: salesYear },
    { data: returnsToday },
    { data: returnsMonth },
    { data: returnsYear },
    { data: purchases },
    { data: purchasePayments },
    { data: unpaidSales },
    { data: settings }
  ] = await Promise.all([
    sTodayQ, sMonthQ, sYearQ, rTodayQ, rMonthQ, rYearQ, purQ, purPayQ, unpSalesQ, settingsQ.maybeSingle()
  ]);

  const sum = (arr: any[], key: string) => arr?.reduce((s, i) => s + Number(i[key]), 0) || 0;

  let totalSalesToday = sum(salesToday || [], 'total_amount');
  let totalSalesMonth = sum(salesMonth || [], 'total_amount');
  let totalSalesYear = sum(salesYear || [], 'total_amount');

  totalSalesToday -= sum(returnsToday || [], 'refund_amount');
  totalSalesMonth -= sum(returnsMonth || [], 'refund_amount');
  totalSalesYear -= sum(returnsYear || [], 'refund_amount');
  
  const totalPurchases = sum(purchases || [], 'total_cost');
  
  const supplierPaidFully = purchases?.reduce((total, p) => {
    if (p.payment_status === 'paid') return total + Number(p.total_cost);
    return total;
  }, 0) || 0;
  
  const explicitSupplierPayments = purchasePayments?.reduce((s, p) => s + Number(p.amount), 0) || 0;
  
  const supplierPaid = Math.min(totalPurchases, supplierPaidFully + explicitSupplierPayments);
  const supplierDue = Math.max(0, totalPurchases - supplierPaid);
  
  const customerUnpaid = sum(unpaidSales || [], 'total_amount');
  
  const taxRate = (settings as any)?.tax_percentage || 18;
  const taxEstimation = (totalSalesMonth * taxRate) / 100;

  const result: FinanceOverview = {
    salesToday: totalSalesToday,
    salesMonth: totalSalesMonth,
    salesYear: totalSalesYear,
    purchasesTotal: totalPurchases,
    supplierDue: supplierDue,
    supplierPaid: supplierPaid,
    customerUnpaid: customerUnpaid,
    taxEstimation: taxEstimation
  };

  financeCache = { key: cacheKey, data: result, timestamp: Date.now() };
  return result;
}