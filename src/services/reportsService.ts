import { ensureSupabaseConfigured } from "./supabaseUtils";
import { formatCurrency } from "../lib/format";
import type { DayClosureRecord } from "../types/database";

// Simple in-memory cache for report data
let cardsCache: { data: ReportCard[], timestamp: number } | null = null;
let dailyReportCache: { data: any, timestamp: number } | null = null;
let financialReportCache: { key: string, data: FinancialSummary, timestamp: number } | null = null;
let productsSoldCache: { key: string, data: any[], timestamp: number } | null = null;
let debtPaymentsCache: { key: string, data: any[], timestamp: number } | null = null;
const CACHE_DURATION_MS = 30000; // 30 seconds

export type ReportCard = {
  title: string;
  value: string;
  meta: string;
  color?: string;
};

export type FinancialSummary = {
  totalSales: number;
  totalCost: number;
  grossProfit: number;
  taxCollected: number;
  netSales: number;
  netIncome: number;
  totalPurchases: number;
  totalStockValue: number;
};

export async function getReportCards(forceRefresh = false): Promise<ReportCard[]> {
  const now = Date.now();
  if (!forceRefresh && cardsCache && now - cardsCache.timestamp < CACHE_DURATION_MS) {
    return cardsCache.data;
  }
  const client = await ensureSupabaseConfigured();

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];
  const startOfDay = `${today}T00:00:00.000Z`;
  const endOfDay = `${today}T23:59:59.999Z`;

  const [
    { data: todaySales, error: salesError },
    { data: todayReturns, error: returnsError },
    { data: todayLoss, error: lossError },
  ] = await Promise.all([
    client
      .from('sales')
      .select('cashier_id, total_amount, payment_status, users:users(full_name)')
      .gte('created_at', startOfDay)
      .lt('created_at', endOfDay),
    client
      .from('sale_returns')
      .select('refund_amount')
      .gte('created_at', startOfDay)
      .lt('created_at', endOfDay),
    client
      .from('stock_counts')
      .select('total_loss_value')
      .gte('created_at', startOfDay)
      .lt('created_at', endOfDay),
  ]);

  if (salesError) throw salesError;
  if (returnsError) throw returnsError;
  if (lossError && lossError.code !== '42703') throw lossError; // Ignore if column doesn't exist yet

  const dailySales = todaySales?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
  const paidSales = todaySales?.filter(sale => sale.payment_status === 'paid')
    .reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
  const unpaidSales = dailySales - paidSales;

  // Get unpaid invoices count
  const unpaidCount = todaySales?.filter(sale => sale.payment_status !== 'paid').length || 0;

  const cashierTotals = new Map<string, { name: string; total: number; count: number }>();
  todaySales?.forEach(sale => {
    const cashierId = sale.cashier_id;
    const name = (sale.users as any)?.full_name || 'Unknown';
    const current = cashierTotals.get(cashierId) || { name, total: 0, count: 0 };
    cashierTotals.set(cashierId, {
      name,
      total: current.total + Number(sale.total_amount),
      count: current.count + 1
    });
  });

  const bestCashier = Array.from(cashierTotals.values())
    .sort((a, b) => b.count - a.count)[0];

  const dailyReturns = todayReturns?.reduce((sum, r) => sum + Number(r.refund_amount), 0) || 0;
  const dailyLoss = todayLoss?.reduce((sum, l) => sum + Number(l.total_loss_value || 0), 0) || 0;

  const result = [
    {
      title: "Daily Sales",
      value: formatCurrency(dailySales),
      meta: "Shift Summary"
    },
    {
      title: "Paid Sales",
      value: formatCurrency(paidSales),
      meta: "Collected Today"
    },
    {
      title: "Unpaid Sales",
      value: formatCurrency(unpaidSales),
      meta: `${unpaidCount} unpaid invoices`,
      color: unpaidSales > 0 ? "text-amber-600" : undefined
    },
    {
      title: "Active Cashier",
      value: bestCashier ? bestCashier.name : "None",
      meta: bestCashier ? `${bestCashier.count} completed sales` : "No activity today"
    },
    {
      title: "Refunds",
      value: formatCurrency(dailyReturns),
      meta: "Approved today"
    },
    {
      title: "Stock Loss",
      value: formatCurrency(dailyLoss),
      meta: "Damaged / expired"
    }
  ];

  cardsCache = { data: result, timestamp: Date.now() };
  return result;
}

export async function getDailyReport(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && dailyReportCache && now - dailyReportCache.timestamp < CACHE_DURATION_MS) {
    return dailyReportCache.data;
  }
  const client = await ensureSupabaseConfigured();

  // 1. First, try to get ANY closed POS day from TODAY to show as the "Last Completed Report"
  const today = new Date().toISOString().split('T')[0];
  const { data: lastClosedToday, error: closedError } = await client
    .from('day_closures')
    .select('*, users:user_id(full_name)')
    .eq('status', 'closed')
    .eq('closing_date', today)
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (closedError) throw closedError;

  // 2. If no shift was closed today, try to get the current MOST ACTIVE open shift
  let targetShift = lastClosedToday;
  if (!targetShift) {
    const { data: currentOpen, error: openError } = await client
      .from('day_closures')
      .select('*, users:user_id(full_name)')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
      
    if (openError) throw openError;
    targetShift = currentOpen;
  }

  if (!targetShift) {
    return {
      startTime: "N/A",
      endTime: "N/A",
      paidSales: "0.00 RWF",
      cashierName: "No active shifts today"
    };
  }

  const startTime = new Date(targetShift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endTime = targetShift.closed_at 
    ? new Date(targetShift.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : "Active Now";
  
  // Get sales for this specific shift
  const { data: shiftSales, error: salesError } = await client
    .from('sales')
    .select('total_amount')
    .eq('cashier_id', targetShift.user_id)
    .eq('location_id', targetShift.location_id)
    .gte('created_at', targetShift.opened_at)
    .lte('created_at', targetShift.closed_at || new Date().toISOString());

  if (salesError) throw salesError;

  let totalSold = shiftSales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;

  // Subtract approved returns for this shift
  const { data: shiftReturns, error: returnsError } = await client
    .from('sale_returns')
    .select('refund_amount')
    .eq('created_by', targetShift.user_id)
    .eq('status', 'completed')
    .gte('created_at', targetShift.opened_at)
    .lte('created_at', targetShift.closed_at || new Date().toISOString());

  if (!returnsError && shiftReturns) {
    const totalRefunded = shiftReturns.reduce((sum, r) => sum + Number(r.refund_amount), 0);
    totalSold -= totalRefunded;
  }

  const result = {
    startTime,
    endTime,
    paidSales: `${totalSold.toLocaleString()} RWF`,
    cashierName: (targetShift.users as any)?.full_name || "Unknown"
  };

  dailyReportCache = { data: result, timestamp: Date.now() };
  return result;
}

export async function getRecentShifts(limit = 10) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from('day_closures')
    .select(`
      *,
      users:user_id(full_name),
      locations:location_id(name)
    `)
    .eq('status', 'closed')
    .order('closed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((shift: any) => ({
    ...shift,
    opening_amount: shift.opening_cash,
    total_sales: shift.total_amount,
  }));
}

export async function getShiftClosure(userId: string, locationId: string, date: string): Promise<DayClosureRecord | null> {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from('day_closures')
    .select('*')
    .eq('user_id', userId)
    .eq('location_id', locationId)
    .eq('closing_date', date.split('T')[0])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getRecentReturns(limit = 10) {
  const client = await ensureSupabaseConfigured();
  const { data, error } = await client
    .from('sale_returns')
    .select(`
      *,
      users:created_by(full_name),
      sales:sale_id(sale_number)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function getFinancialReport(
  startDate: string, 
  endDate: string, 
  locationId?: string | null
): Promise<FinancialSummary> {
  const key = `${startDate}:${endDate}:${locationId || 'all'}`;
  const now = Date.now();
  if (financialReportCache?.key === key && now - financialReportCache.timestamp < CACHE_DURATION_MS) {
    return financialReportCache.data;
  }

  const client = await ensureSupabaseConfigured();
  
  // 1. Get all paid sales in range
  let salesQuery = client
    .from('sales')
    .select('id, total_amount, tax_amount')
    .gte('created_at', `${startDate}T00:00:00.000Z`)
    .lte('created_at', `${endDate}T23:59:59.999Z`)
    .eq('payment_status', 'paid');

  if (locationId) {
    salesQuery = salesQuery.eq('location_id', locationId);
  }
    
  const { data: sales, error: salesError } = await salesQuery;
  if (salesError) throw salesError;
  
  const totalSales = sales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;
  const taxCollected = sales?.reduce((sum, s) => sum + Number(s.tax_amount), 0) || 0;

  // 2. Get total purchases in range
  let purchasesQuery = client
    .from('purchases')
    .select('total_amount')
    .gte('created_at', `${startDate}T00:00:00.000Z`)
    .lte('created_at', `${endDate}T23:59:59.999Z`);

  if (locationId) {
    purchasesQuery = purchasesQuery.eq('location_id', locationId);
  }

  const { data: purchases } = await purchasesQuery;
  const totalPurchases = purchases?.reduce((sum, p) => sum + Number(p.total_amount || 0), 0) || 0;

  // 3. Get total stock value in money (current inventory value)
  let stockQuery = client
    .from('product_stocks')
    .select('quantity, products(cost_price, is_active)')
    .gt('quantity', 0);

  if (locationId) {
    stockQuery = stockQuery.eq('location_id', locationId);
  }

  const { data: stocks } = await stockQuery;
  const totalStockValue = (stocks || []).reduce((sum, s) => {
    if ((s.products as any)?.is_active === false) return sum;
    const cost = Number((s.products as any)?.cost_price || 0);
    return sum + (Number(s.quantity || 0) * cost);
  }, 0);
  
  // 4. Get all sale items for these sales to calculate cost of goods sold
  const saleIds = sales?.map(s => s.id) || [];
  let totalCost = 0;

  if (saleIds.length > 0) {
    const { data: items, error: itemsError } = await client
      .from('sale_items')
      .select('quantity, products(cost_price)')
      .in('sale_id', saleIds);
      
    if (!itemsError && items) {
      items.forEach(item => {
        const cost = (item.products as any)?.cost_price || 0;
        totalCost += cost * Number(item.quantity);
      });
    }
  }
  
  const netSales = totalSales - taxCollected;
  const grossProfit = totalSales - totalCost;
  const netIncome = netSales - totalCost;
  
  const result: FinancialSummary = {
    totalSales,
    totalCost,
    grossProfit,
    taxCollected,
    netSales,
    netIncome,
    totalPurchases,
    totalStockValue,
  };

  financialReportCache = { key, data: result, timestamp: Date.now() };
  return result;
}

export async function getAggregatedProductsSold(startDate: string, endDate: string, locationId?: string | null) {
  const key = `${startDate}:${endDate}:${locationId || 'all'}`;
  const now = Date.now();
  if (productsSoldCache?.key === key && now - productsSoldCache.timestamp < CACHE_DURATION_MS) {
    return productsSoldCache.data;
  }

  const client = await ensureSupabaseConfigured();

  let salesQuery = client
    .from('sales')
    .select('id')
    .gte('created_at', `${startDate}T00:00:00.000Z`)
    .lte('created_at', `${endDate}T23:59:59.999Z`);

  if (locationId) {
    salesQuery = salesQuery.eq('location_id', locationId);
  }

  const { data: sales, error: salesError } = await salesQuery;

  if (salesError) throw salesError;

  const saleIds = sales?.map(s => s.id) || [];
  if (saleIds.length === 0) {
    productsSoldCache = { key, data: [], timestamp: Date.now() };
    return [];
  }

  const { data: items, error: itemsError } = await client
    .from('sale_items')
    .select('quantity, line_total, products(name)')
    .in('sale_id', saleIds);

  if (itemsError) throw itemsError;

  const aggregated = new Map<string, { name: string; quantity: number; revenue: number }>();

  items?.forEach(item => {
    const productName = (item.products as any)?.name || 'Unknown Product';
    const current = aggregated.get(productName) || { name: productName, quantity: 0, revenue: 0 };
    aggregated.set(productName, {
      name: productName,
      quantity: current.quantity + Number(item.quantity),
      revenue: current.revenue + Number(item.line_total)
    });
  });

  const result = Array.from(aggregated.values()).sort((a, b) => b.revenue - a.revenue);
  productsSoldCache = { key, data: result, timestamp: Date.now() };
  return result;
}

export async function getDebtPaymentsReport(startDate: string, endDate: string, locationId?: string | null) {
  const key = `${startDate}:${endDate}:${locationId || 'all'}`;
  const now = Date.now();
  if (debtPaymentsCache?.key === key && now - debtPaymentsCache.timestamp < CACHE_DURATION_MS) {
    return debtPaymentsCache.data;
  }

  const client = await ensureSupabaseConfigured();

  let paymentsQuery = client
    .from('sale_payments')
    .select(`
      id,
      amount,
      paid_at,
      sales!inner(
        sale_number,
        customer_id,
        cashier_id,
        location_id,
        created_at,
        customers(full_name),
        users(full_name)
      )
    `)
    .gte('paid_at', `${startDate}T00:00:00.000Z`)
    .lte('paid_at', `${endDate}T23:59:59.999Z`)
    .gt('amount', 0);

  if (locationId) {
    paymentsQuery = paymentsQuery.eq('sales.location_id', locationId);
  }

  const { data: payments, error: paymentsError } = await paymentsQuery;

  if (paymentsError) throw paymentsError;

  const debtPayments = payments?.filter((p: any) => {
    const sale = p.sales as any;
    if (!sale?.customer_id) return false;
    return true;
  }).map((p: any) => {
    const sale = p.sales as any;
    return {
      id: p.id,
      clientName: sale.customers?.full_name || 'Unknown Client',
      amount: Number(p.amount),
      cashierName: sale.users?.full_name || 'Unknown Cashier',
      date: p.paid_at,
      saleNumber: sale.sale_number
    };
  }) || [];

  const result = debtPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  debtPaymentsCache = { key, data: result, timestamp: Date.now() };
  return result;
}
