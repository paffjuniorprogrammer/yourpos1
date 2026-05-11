import { ensureSupabaseConfigured } from "./supabaseUtils";
import { formatCurrency } from "../lib/format";

// Simple in-memory cache for report data
let cardsCache: { data: ReportCard[], timestamp: number } | null = null;
let dailyReportCache: { data: any, timestamp: number } | null = null;
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
      value: formatCurrency(dailySales),
      meta: "Shift Summary"
    },
    {
      title: "Wastage Loss",
      value: formatCurrency(dailyLoss),
      meta: "Damages & Expired"
    },
    {
      title: "Daily Returns",
      value: formatCurrency(dailyReturns),
      meta: `${todayReturns?.length || 0} items returned`
    },
    {
      title: "Net Paid Sales",
      value: formatCurrency(paidSales - dailyReturns),
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

export async function getFinancialReport(startDate: string, endDate: string): Promise<FinancialSummary> {
  const client = await ensureSupabaseConfigured();
  
  // 1. Get all paid sales in range
  const { data: sales, error: salesError } = await client
    .from('sales')
    .select('id, total_amount, tax_amount')
    .gte('created_at', `${startDate}T00:00:00.000Z`)
    .lte('created_at', `${endDate}T23:59:59.999Z`)
    .eq('payment_status', 'paid');
    
  if (salesError) throw salesError;
  
  const totalSales = sales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;
  const taxCollected = sales?.reduce((sum, s) => sum + Number(s.tax_amount), 0) || 0;
  
  // 2. Get all sale items for these sales to calculate cost
  const saleIds = sales?.map(s => s.id) || [];
  if (saleIds.length === 0) {
    return { totalSales: 0, totalCost: 0, grossProfit: 0, taxCollected: 0, netIncome: 0 };
  }
  
  // We fetch in chunks if there are too many sales (supabase 'in' limit is usually ~1000)
  // For now, simpler:
  const { data: items, error: itemsError } = await client
    .from('sale_items')
    .select('quantity, products(cost_price)')
    .in('sale_id', saleIds);
    
  if (itemsError) throw itemsError;
  
  let totalCost = 0;
  items?.forEach(item => {
    const cost = (item.products as any)?.cost_price || 0;
    totalCost += cost * Number(item.quantity);
  });
  
  const netSales = totalSales - taxCollected;
  const grossProfit = totalSales - totalCost;
  const netIncome = netSales - totalCost;
  
  return {
    totalSales,
    totalCost,
    grossProfit,
    taxCollected,
    netSales,
    netIncome
  };
}

export async function getAggregatedProductsSold(startDate: string, endDate: string) {
  const client = await ensureSupabaseConfigured();

  const { data: sales, error: salesError } = await client
    .from('sales')
    .select('id')
    .gte('created_at', `${startDate}T00:00:00.000Z`)
    .lte('created_at', `${endDate}T23:59:59.999Z`);

  if (salesError) throw salesError;

  const saleIds = sales?.map(s => s.id) || [];
  if (saleIds.length === 0) return [];

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

  return Array.from(aggregated.values()).sort((a, b) => b.revenue - a.revenue);
}

export async function getDebtPaymentsReport(startDate: string, endDate: string) {
  const client = await ensureSupabaseConfigured();

  // Debt payments are those where a payment is made, and the sale has a customer.
  // The 'sale_payments' table doesn't have cashier_id or customer_id, so we must join 'sales'.
  const { data: payments, error: paymentsError } = await client
    .from('sale_payments')
    .select(`
      id,
      amount,
      paid_at,
      sales!inner(
        sale_number,
        customer_id,
        cashier_id,
        created_at,
        customers(full_name),
        users(full_name)
      )
    `)
    .gte('paid_at', `${startDate}T00:00:00.000Z`)
    .lte('paid_at', `${endDate}T23:59:59.999Z`)
    .gt('amount', 0); // Exclude 0 amount payments if any

  if (paymentsError) throw paymentsError;

  // Filter for payments where the sale has a customer and the payment is not at the EXACT same time as the sale creation
  // Or simpler: just list payments for known customers. A "debt payment" usually implies an existing customer balance.
  const debtPayments = payments?.filter((p: any) => {
    const sale = p.sales as any;
    if (!sale.customer_id) return false;
    
    // Simple heuristic: If the payment was made after the sale date (different day or significantly later), it's a debt payment.
    // However, if a client pays a deposit on the spot, it's also a payment towards their debt. 
    // To be comprehensive as requested, we return all payments from customers.
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

  return debtPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}