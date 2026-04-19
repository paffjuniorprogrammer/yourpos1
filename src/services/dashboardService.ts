import { ensureSupabaseConfigured } from "./supabaseUtils";

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
let statsCache: { data: DashboardStat[], timestamp: number } | null = null;
let trendCache: { data: SalesTrendItem[], timestamp: number } | null = null;
let transactionsCache: { data: RecentTransaction[], timestamp: number } | null = null;
const CACHE_DURATION_MS = 30000; // 30 seconds
let unpaidCustomersCache: { data: UnpaidItem[], timestamp: number } | null = null;
let unpaidSuppliersCache: { data: UnpaidItem[], timestamp: number } | null = null;

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

export async function getDashboardStats(forceRefresh = false): Promise<DashboardStat[]> {
  const now = Date.now();
  if (!forceRefresh && statsCache && now - statsCache.timestamp < CACHE_DURATION_MS) {
    return statsCache.data;
  }

  const client = await ensureSupabaseConfigured();

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  // Get total sales for today
  const { data: todaySales, error: salesError } = await client
    .from('sales')
    .select('total_amount')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .lt('created_at', `${today}T23:59:59.999Z`);

  if (salesError) throw salesError;
  let totalSalesToday = todaySales?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;

  // Subtract today's completed refunds
  const { data: todayReturns } = await client
    .from('sale_returns')
    .select('refund_amount')
    .eq('status', 'completed')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .lt('created_at', `${today}T23:59:59.999Z`);
  const todaysRefund = todayReturns?.reduce((sum, r) => sum + Number(r.refund_amount), 0) || 0;
  totalSalesToday -= todaysRefund;

  // Get total revenue for current month
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const { data: monthSales, error: monthError } = await client
    .from('sales')
    .select('total_amount')
    .gte('created_at', `${currentMonth}-01T00:00:00.000Z`);

  if (monthError) throw monthError;
  let totalRevenue = monthSales?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;

  // Subtract this month's completed refunds
  const { data: monthReturns } = await client
    .from('sale_returns')
    .select('refund_amount')
    .eq('status', 'completed')
    .gte('created_at', `${currentMonth}-01T00:00:00.000Z`);
  const monthRefund = monthReturns?.reduce((sum, r) => sum + Number(r.refund_amount), 0) || 0;
  totalRevenue -= monthRefund;

  // Get products sold today (sum of quantities from sale_items)
  const { data: todayItems, error: itemsError } = await client
    .from('sale_items')
    .select('quantity, sales!inner(created_at)')
    .gte('sales.created_at', `${today}T00:00:00.000Z`)
    .lt('sales.created_at', `${today}T23:59:59.999Z`);

  if (itemsError) throw itemsError;

  const productsSold = todayItems?.reduce((sum, item) => sum + Number(item.quantity), 0) || 0;

  // Get low stock alerts (products below reorder level)
  // PostgREST doesn't support comparing two columns directly in filters,
  // so we fetch the data and filter in JS.
  const { data: products, error: stockError } = await client
    .from('products')
    .select('stock_quantity, reorder_level')
    .eq('is_active', true);

  if (stockError) throw stockError;

  const lowStockCount = products?.filter(p => (p.stock_quantity || 0) < (p.reorder_level || 0)).length || 0;

  // Get Unpaid Suppliers total (Purchases not fully paid)
  const { data: unpaidPurchases, error: unpaidPurchasesError } = await client
    .from('purchases')
    .select('total_cost')
    .neq('payment_status', 'paid');

  if (unpaidPurchasesError) throw unpaidPurchasesError;
  const totalUnpaidSuppliers = unpaidPurchases?.reduce((sum, p) => sum + Number(p.total_cost), 0) || 0;

  // Get Unpaid Customers total (Sales not fully paid)
  const { data: unpaidSales, error: unpaidSalesError } = await client
    .from('sales')
    .select('total_amount')
    .neq('payment_status', 'paid');

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

  statsCache = { data: result, timestamp: Date.now() };
  return result;
}

export async function getSalesTrend(): Promise<SalesTrendItem[]> {
  const now = Date.now();
  if (trendCache && now - trendCache.timestamp < CACHE_DURATION_MS) {
    return trendCache.data;
  }
  const client = await ensureSupabaseConfigured();

  // Get last 7 days boundary
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push(date);
  }

  const startDate = `${days[0].toISOString().split('T')[0]}T00:00:00.000Z`;
  const endDate = `${days[6].toISOString().split('T')[0]}T23:59:59.999Z`;

  const { data: sales, error } = await client
    .from('sales')
    .select('total_amount, created_at')
    .gte('created_at', startDate)
    .lt('created_at', endDate);

  if (error) throw error;

  const trendData: SalesTrendItem[] = [];

  for (const date of days) {
    const dateStr = date.toISOString().split('T')[0];
    
    // Sum total amount for this specific day
    const daySales = sales?.filter(sale => sale.created_at.startsWith(dateStr)) || [];
    const total = daySales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
    
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

    trendData.push({
      label: dayName,
      value: Math.round(total / 100) // Scale down for chart display
    });
  }

  trendCache = { data: trendData, timestamp: Date.now() };
  return trendData;
}

export async function getRecentTransactions(): Promise<RecentTransaction[]> {
  const now = Date.now();
  if (transactionsCache && now - transactionsCache.timestamp < CACHE_DURATION_MS) {
    return transactionsCache.data;
  }
  const client = await ensureSupabaseConfigured();

  const { data, error } = await client
    .from('sales')
    .select(`
      id,
      sale_number,
      total_amount,
      created_at,
      customers(full_name),
      users!sales_cashier_id_fkey(full_name)
    `)
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

  transactionsCache = { data: result, timestamp: Date.now() };
  return result;
}

export async function getUnpaidCustomers(): Promise<UnpaidItem[]> {
  const now = Date.now();
  if (unpaidCustomersCache && now - unpaidCustomersCache.timestamp < CACHE_DURATION_MS) {
    return unpaidCustomersCache.data;
  }
  const client = await ensureSupabaseConfigured();

  const { data, error } = await client
    .from('sales')
    .select(`
      id,
      sale_number,
      total_amount,
      created_at,
      customers(full_name)
    `)
    .neq('payment_status', 'paid')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const result: UnpaidItem[] = (data || []).map((sale: any) => ({
    id: sale.id,
    name: sale.customers?.full_name || 'Walk-in Customer',
    amount: `${Math.round(Number(sale.total_amount)).toLocaleString()} RWF`,
    date: new Date(sale.created_at).toLocaleDateString()
  }));

  unpaidCustomersCache = { data: result, timestamp: Date.now() };
  return result;
}

export async function getUnpaidSuppliers(): Promise<UnpaidItem[]> {
  const now = Date.now();
  if (unpaidSuppliersCache && now - unpaidSuppliersCache.timestamp < CACHE_DURATION_MS) {
    return unpaidSuppliersCache.data;
  }
  const client = await ensureSupabaseConfigured();

  const { data, error } = await client
    .from('purchases')
    .select(`
      id,
      total_cost,
      purchase_date,
      suppliers(name)
    `)
    .neq('payment_status', 'paid')
    .order('purchase_date', { ascending: false });

  if (error) throw error;

  const result: UnpaidItem[] = (data || []).map((purchase: any) => ({
    id: purchase.id,
    name: purchase.suppliers?.name || 'Unknown Supplier',
    amount: `${Math.round(Number(purchase.total_cost)).toLocaleString()} RWF`,
    date: new Date(purchase.purchase_date).toLocaleDateString()
  }));

  unpaidSuppliersCache = { data: result, timestamp: Date.now() };
  return result;
}

let financeCache: { data: FinanceOverview, timestamp: number } | null = null;

export async function getFinanceOverview(forceRefresh = false): Promise<FinanceOverview> {
  const now = Date.now();
  if (!forceRefresh && financeCache && now - financeCache.timestamp < CACHE_DURATION_MS * 2) {
    return financeCache.data;
  }
  const client = await ensureSupabaseConfigured();
  
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentYear = new Date().getFullYear().toString();

  // Queries
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
    client.from('sales').select('total_amount').gte('created_at', `${today}T00:00:00.000Z`),
    client.from('sales').select('total_amount').gte('created_at', `${currentMonth}-01T00:00:00.000Z`),
    client.from('sales').select('total_amount').gte('created_at', `${currentYear}-01-01T00:00:00.000Z`),
    client.from('sale_returns').select('refund_amount').eq('status', 'completed').gte('created_at', `${today}T00:00:00.000Z`),
    client.from('sale_returns').select('refund_amount').eq('status', 'completed').gte('created_at', `${currentMonth}-01T00:00:00.000Z`),
    client.from('sale_returns').select('refund_amount').eq('status', 'completed').gte('created_at', `${currentYear}-01-01T00:00:00.000Z`),
    client.from('purchases').select('total_cost, payment_status'),
    client.from('purchase_payments').select('amount'),
    client.from('sales').select('total_amount').neq('payment_status', 'paid'),
    client.from('shop_settings').select('tax_percentage').maybeSingle()
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

  financeCache = { data: result, timestamp: Date.now() };
  return result;
}