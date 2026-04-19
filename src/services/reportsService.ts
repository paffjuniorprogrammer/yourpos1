import { ensureSupabaseConfigured } from "./supabaseUtils";

// Simple in-memory cache for report data
let cardsCache: { data: ReportCard[], timestamp: number } | null = null;
let dailyReportCache: { data: any, timestamp: number } | null = null;
const CACHE_DURATION_MS = 30000; // 30 seconds

export type ReportCard = {
  title: string;
  value: string;
  meta: string;
};

export async function getReportCards(forceRefresh = false): Promise<ReportCard[]> {
  const now = Date.now();
  if (!forceRefresh && cardsCache && now - cardsCache.timestamp < CACHE_DURATION_MS) {
    return cardsCache.data;
  }
  const client = await ensureSupabaseConfigured();

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  // Get daily sales total
  const { data: todaySales, error: salesError } = await client
    .from('sales')
    .select('total_amount, payment_status')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .lt('created_at', `${today}T23:59:59.999Z`);

  if (salesError) throw salesError;

  const dailySales = todaySales?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
  const paidSales = todaySales?.filter(sale => sale.payment_status === 'paid')
    .reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
  const unpaidSales = dailySales - paidSales;

  // Get unpaid invoices count
  const unpaidCount = todaySales?.filter(sale => sale.payment_status !== 'paid').length || 0;

  // Get best cashier (most sales today)
  const { data: cashierSales, error: cashierError } = await client
    .from('sales')
    .select('cashier_id, total_amount, users:users(full_name)')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .lt('created_at', `${today}T23:59:59.999Z`);

  if (cashierError) throw cashierError;

  const cashierTotals = new Map<string, { name: string; total: number; count: number }>();
  cashierSales?.forEach(sale => {
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

  // Get today's returns
  const { data: todayReturns, error: returnsError } = await client
    .from('sale_returns')
    .select('refund_amount')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .lt('created_at', `${today}T23:59:59.999Z`);

  if (returnsError) throw returnsError;
  const dailyReturns = todayReturns?.reduce((sum, r) => sum + Number(r.refund_amount), 0) || 0;

  // Get today's wastage/loss
  const { data: todayLoss, error: lossError } = await client
    .from('stock_counts')
    .select('total_loss_value')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .lt('created_at', `${today}T23:59:59.999Z`);

  if (lossError && lossError.code !== '42703') throw lossError; // Ignore if column doesn't exist yet
  const dailyLoss = todayLoss?.reduce((sum, l) => sum + Number(l.total_loss_value || 0), 0) || 0;

  const result = [
    {
      title: "Daily Sales",
      value: `${dailySales.toLocaleString()} RWF`,
      meta: "Shift Summary"
    },
    {
      title: "Wastage Loss",
      value: `${dailyLoss.toLocaleString()} RWF`,
      meta: "Damages & Expired"
    },
    {
      title: "Daily Returns",
      value: `${dailyReturns.toLocaleString()} RWF`,
      meta: `${todayReturns?.length || 0} items returned`
    },
    {
      title: "Net Paid Sales",
      value: `${(paidSales - dailyReturns).toLocaleString()} RWF`,
      meta: unpaidCount > 0 ? `${((paidSales / dailySales) * 100).toFixed(0)}% paid (less returns)` : "After returns deducted"
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

  // 1. First, try to get ANY closed shift from TODAY to show as the "Last Completed Report"
  const today = new Date().toISOString().split('T')[0];
  const { data: lastClosedToday, error: closedError } = await client
    .from('cash_registers')
    .select('*, users:users(full_name)')
    .eq('status', 'closed')
    .gte('closed_at', `${today}T00:00:00.000Z`)
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (closedError) throw closedError;

  // 2. If no shift was closed today, try to get the current MOST ACTIVE open shift
  let targetShift = lastClosedToday;
  if (!targetShift) {
    const { data: currentOpen, error: openError } = await client
      .from('cash_registers')
      .select('*, users:users(full_name)')
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
    .from('cash_registers')
    .select(`
      *,
      users:users(full_name),
      locations:locations(name)
    `)
    .eq('status', 'closed')
    .order('closed_at', { ascending: false })
    .limit(limit);

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