import { ensureSupabaseConfigured } from "./supabaseUtils";
import { formatCurrency } from "../lib/format";
import type { DayClosureRecord } from "../types/database";
import { supabase } from "../lib/supabase";

// Simple in-memory cache for report data
let cardsCache: { key: string, data: ReportCard[], timestamp: number } | null = null;
let dailyReportCache: { key: string, data: any, timestamp: number } | null = null;
let financialReportCache: { key: string, data: FinancialSummary, timestamp: number } | null = null;
let productsSoldCache: { key: string, data: any[], timestamp: number } | null = null;
let debtPaymentsCache: { key: string, data: any[], timestamp: number } | null = null;
let hospitalityReportCache: { key: string, data: HospitalitySummary, timestamp: number } | null = null;
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

export type HospitalitySummary = {
  accommodationRevenue: number;
  folioCharges: number;
  barAndKitchenCharges: number;
  paymentsCollected: number;
  guestRevenue: number;
  bookingCount: number;
};

const DEMO_REPORT_CARDS: ReportCard[] = [
  { title: "Daily Sales", value: "252,000 RWF", meta: "Shift Summary" },
  { title: "Paid Invoices", value: "252,000 RWF", meta: "Direct cash / MoMo collected" },
  { title: "Unpaid Invoices", value: "0 RWF", meta: "0 unpaid today" },
  { title: "Best Cashier", value: "Demo Store Admin", meta: "42 sales completed" },
];

const DEMO_FINANCIAL_SUMMARY: FinancialSummary = {
  totalSales: 4850000,
  totalCost: 3200000,
  grossProfit: 1650000,
  taxCollected: 739831,
  netSales: 4110169,
  netIncome: 910169,
  totalPurchases: 2500000,
  totalStockValue: 8450000,
};

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
    console.warn("Failed to get effective business ID:", e);
  }
  return null;
}

export async function getReportCards(forceRefresh = false, businessId?: string): Promise<ReportCard[]> {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_REPORT_CARDS;
  }
  const bizId = await getEffectiveBusinessId(businessId);
  const cacheKey = `cards_${bizId || 'all'}`;
  const now = Date.now();
  if (!forceRefresh && cardsCache && cardsCache.key === cacheKey && now - cardsCache.timestamp < CACHE_DURATION_MS) {
    return cardsCache.data;
  }
  const client = await ensureSupabaseConfigured();

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];
  const startOfDay = `${today}T00:00:00.000Z`;
  const endOfDay = `${today}T23:59:59.999Z`;

  let salesQuery = client
    .from('sales')
    .select('cashier_id, total_amount, payment_status, cashier:users!sales_cashier_id_fkey(full_name)')
    .gte('created_at', startOfDay)
    .lt('created_at', endOfDay);

  let returnsQuery = client
    .from('sale_returns')
    .select('refund_amount')
    .eq('status', 'completed')
    .gte('created_at', startOfDay)
    .lt('created_at', endOfDay);

  let lossQuery = client
    .from('stock_counts')
    .select('total_loss_value')
    .gte('created_at', startOfDay)
    .lt('created_at', endOfDay);

  if (bizId) {
    salesQuery = salesQuery.eq('business_id', bizId);
    returnsQuery = returnsQuery.eq('business_id', bizId);
    lossQuery = lossQuery.eq('business_id', bizId);
  }

  const [
    { data: todaySales, error: salesError },
    { data: todayReturns, error: returnsError },
    { data: todayLoss, error: lossError },
  ] = await Promise.all([salesQuery, returnsQuery, lossQuery]);

  if (salesError) throw salesError;
  if (returnsError) throw returnsError;
  if (lossError && lossError.code !== '42703') throw lossError;

  const grossDailySales = todaySales?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
  const grossPaidSales = todaySales?.filter(sale => sale.payment_status === 'paid')
    .reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
  const dailyReturns = todayReturns?.reduce((sum, r) => sum + Number(r.refund_amount), 0) || 0;
  const dailySales = Math.max(0, grossDailySales - dailyReturns);
  const paidSales = Math.max(0, grossPaidSales - dailyReturns);
  const unpaidSales = Math.max(0, dailySales - paidSales);
  const unpaidCount = todaySales?.filter(sale => sale.payment_status !== 'paid').length || 0;

  const cashierTotals = new Map<string, { name: string; total: number; count: number }>();
  todaySales?.forEach(sale => {
    const cashierId = sale.cashier_id;
    const name = (sale.cashier as any)?.full_name || 'Unknown';
    const current = cashierTotals.get(cashierId) || { name, total: 0, count: 0 };
    cashierTotals.set(cashierId, {
      name,
      total: current.total + Number(sale.total_amount),
      count: current.count + 1
    });
  });

  const bestCashier = Array.from(cashierTotals.values())
    .sort((a, b) => b.count - a.count)[0];

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

  cardsCache = { key: cacheKey, data: result, timestamp: Date.now() };
  return result;
}

export async function getDailyReport(forceRefresh = false, businessId?: string) {
  const bizId = await getEffectiveBusinessId(businessId);
  const cacheKey = `daily_${bizId || 'all'}`;
  const now = Date.now();
  if (!forceRefresh && dailyReportCache && dailyReportCache.key === cacheKey && now - dailyReportCache.timestamp < CACHE_DURATION_MS) {
    return dailyReportCache.data;
  }
  const client = await ensureSupabaseConfigured();

  // 1. First, try to get ANY closed POS day from TODAY for THIS business
  const today = new Date().toISOString().split('T')[0];
  let closedQuery = client
    .from('day_closures')
    .select('*, users:user_id(full_name)')
    .eq('status', 'closed')
    .eq('closing_date', today);

  if (bizId) closedQuery = closedQuery.eq('business_id', bizId);

  const { data: lastClosedToday, error: closedError } = await closedQuery
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (closedError) throw closedError;

  // 2. If no shift was closed today, try to get the current MOST ACTIVE open shift for THIS business
  let targetShift = lastClosedToday;
  if (!targetShift) {
    let openQuery = client
      .from('day_closures')
      .select('*, users:user_id(full_name)')
      .eq('status', 'open');

    if (bizId) openQuery = openQuery.eq('business_id', bizId);

    const { data: currentOpen, error: openError } = await openQuery
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
      
    if (openError) throw openError;
    targetShift = currentOpen;
  }

  if (!targetShift) {
    const emptyResult = {
      startTime: "N/A",
      endTime: "N/A",
      paidSales: "0 RWF",
      cashierName: "No active shifts today"
    };
    dailyReportCache = { key: cacheKey, data: emptyResult, timestamp: Date.now() };
    return emptyResult;
  }

  const startTime = targetShift.opened_at 
    ? new Date(targetShift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : "N/A";
  const endTime = targetShift.closed_at 
    ? new Date(targetShift.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : "Active Now";
  
  // Get sales for this specific shift
  let salesQuery = client
    .from('sales')
    .select('total_amount')
    .eq('cashier_id', targetShift.user_id)
    .gte('created_at', targetShift.opened_at || `${today}T00:00:00.000Z`)
    .lte('created_at', targetShift.closed_at || new Date().toISOString());

  if (targetShift.location_id) {
    salesQuery = salesQuery.eq('location_id', targetShift.location_id);
  }
  if (bizId) {
    salesQuery = salesQuery.eq('business_id', bizId);
  }

  const { data: shiftSales, error: salesError } = await salesQuery;
  if (salesError) throw salesError;

  let totalSold = shiftSales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;

  // Subtract approved returns for this shift
  let returnsQuery = client
    .from('sale_returns')
    .select('refund_amount')
    .eq('created_by', targetShift.user_id)
    .eq('status', 'completed')
    .gte('created_at', targetShift.opened_at || `${today}T00:00:00.000Z`)
    .lte('created_at', targetShift.closed_at || new Date().toISOString());

  if (bizId) {
    returnsQuery = returnsQuery.eq('business_id', bizId);
  }

  const { data: shiftReturns, error: returnsError } = await returnsQuery;

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

  dailyReportCache = { key: cacheKey, data: result, timestamp: Date.now() };
  return result;
}

export async function getRecentShifts(limit = 10, businessId?: string) {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return [
      {
        id: "demo-shift-1",
        user_id: "demo-user-id",
        location_id: "demo-loc-1",
        closing_date: new Date().toISOString().split('T')[0],
        opened_at: new Date(Date.now() - 32400000).toISOString(),
        closed_at: new Date(Date.now() - 3600000).toISOString(),
        opening_cash: 50000,
        opening_amount: 50000,
        total_amount: 252000,
        total_sales: 252000,
        cash_amount: 145000,
        momo_amount: 82000,
        bank_amount: 0,
        card_amount: 25000,
        status: "closed",
        users: { full_name: "Demo Store Admin" },
        locations: { name: "Main Branch - Nyarugenge (Demo)" },
      }
    ];
  }
  const bizId = await getEffectiveBusinessId(businessId);
  const client = await ensureSupabaseConfigured();
  
  let query = client
    .from('day_closures')
    .select(`
      *,
      users:user_id(full_name),
      locations:location_id(name)
    `)
    .eq('status', 'closed');

  if (bizId) {
    query = query.eq('business_id', bizId);
  }

  const { data, error } = await query
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
  if (localStorage.getItem("is_demo_mode") === "true") {
    return {
      id: "demo-shift-1",
      business_id: "demo-business-id",
      user_id: "demo-user-id",
      location_id: "demo-loc-1",
      closing_date: new Date().toISOString().split('T')[0],
      opened_at: new Date(Date.now() - 32400000).toISOString(),
      closed_at: new Date(Date.now() - 3600000).toISOString(),
      opening_cash: 50000,
      cash_amount: 145000,
      momo_amount: 82000,
      bank_amount: 0,
      card_amount: 25000,
      credit_amount: 0,
      total_amount: 252000,
      status: "closed",
      notes: "Demo closed shift report",
      created_at: new Date().toISOString()
    } as any;
  }
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

export async function getRecentReturns(limit = 10, businessId?: string) {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return [];
  }
  const bizId = await getEffectiveBusinessId(businessId);
  const client = await ensureSupabaseConfigured();

  let query = client
    .from('sale_returns')
    .select(`
      *,
      users:created_by(full_name),
      sales:sale_id(sale_number)
    `);

  if (bizId) {
    query = query.eq('business_id', bizId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getFinancialReport(
  startDate: string, 
  endDate: string, 
  locationId?: string | null,
  businessId?: string
): Promise<FinancialSummary> {
  if (localStorage.getItem("is_demo_mode") === "true") {
    return DEMO_FINANCIAL_SUMMARY;
  }
  const bizId = await getEffectiveBusinessId(businessId);
  const key = `${bizId || 'all'}:${startDate}:${endDate}:${locationId || 'all'}`;
  const now = Date.now();
  if (financialReportCache?.key === key && now - financialReportCache.timestamp < CACHE_DURATION_MS) {
    return financialReportCache.data;
  }

  const client = await ensureSupabaseConfigured();
  
  // 1. Get all paid sales in range for this business
  let salesQuery = client
    .from('sales')
    .select('id, total_amount, tax_amount')
    .gte('created_at', `${startDate}T00:00:00.000Z`)
    .lte('created_at', `${endDate}T23:59:59.999Z`)
    .eq('payment_status', 'paid');

  if (bizId) salesQuery = salesQuery.eq('business_id', bizId);
  if (locationId) salesQuery = salesQuery.eq('location_id', locationId);
    
  const { data: sales, error: salesError } = await salesQuery;
  if (salesError) throw salesError;
  
  const totalSales = sales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;
  const taxCollected = sales?.reduce((sum, s) => sum + Number(s.tax_amount), 0) || 0;

  // 2. Get total purchases in range for this business
  let purchasesQuery = client
    .from('purchases')
    .select('total_amount')
    .gte('created_at', `${startDate}T00:00:00.000Z`)
    .lte('created_at', `${endDate}T23:59:59.999Z`);

  if (bizId) purchasesQuery = purchasesQuery.eq('business_id', bizId);
  if (locationId) purchasesQuery = purchasesQuery.eq('location_id', locationId);

  const { data: purchases } = await purchasesQuery;
  const totalPurchases = purchases?.reduce((sum, p) => sum + Number(p.total_amount || 0), 0) || 0;

  // 3. Get total stock value in money for this business
  let stockQuery = client
    .from('product_stocks')
    .select('quantity, products!inner(cost_price, is_active, business_id)')
    .gt('quantity', 0);

  if (bizId) stockQuery = stockQuery.eq('products.business_id', bizId);
  if (locationId) stockQuery = stockQuery.eq('location_id', locationId);

  const { data: stocks } = await stockQuery;
  const totalStockValue = (stocks || []).reduce((sum, s) => {
    if ((s.products as any)?.is_active === false) return sum;
    const cost = Number((s.products as any)?.cost_price || 0);
    return sum + (Number(s.quantity || 0) * cost);
  }, 0);
  
  // 4. Get all sale items for these sales
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

export async function getAggregatedProductsSold(startDate: string, endDate: string, locationId?: string | null, businessId?: string) {
  const bizId = await getEffectiveBusinessId(businessId);
  const key = `${bizId || 'all'}:${startDate}:${endDate}:${locationId || 'all'}`;
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

  if (bizId) salesQuery = salesQuery.eq('business_id', bizId);
  if (locationId) salesQuery = salesQuery.eq('location_id', locationId);

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

/**
 * Hospitality revenue is deliberately separated from normal POS takings.
 * A bar order posted to a room is an unpaid folio charge; it becomes cash
 * revenue only when reception records a room payment.
 */
export async function getHospitalityReport(
  startDate: string,
  endDate: string,
  businessId?: string,
): Promise<HospitalitySummary> {
  const bizId = await getEffectiveBusinessId(businessId);
  const key = `${bizId || 'all'}:${startDate}:${endDate}`;
  const now = Date.now();
  if (hospitalityReportCache?.key === key && now - hospitalityReportCache.timestamp < CACHE_DURATION_MS) {
    return hospitalityReportCache.data;
  }

  const client = await ensureSupabaseConfigured();
  const rangeStart = `${startDate}T00:00:00.000Z`;
  const rangeEnd = `${endDate}T23:59:59.999Z`;

  let bookingsQuery = client
    .from('room_bookings')
    .select('id, room_rate')
    .gte('check_in', rangeStart)
    .lte('check_in', rangeEnd)
    .neq('status', 'cancelled');
  let chargesQuery = client
    .from('room_charges')
    .select('amount, quantity, service_type')
    .gte('created_at', rangeStart)
    .lte('created_at', rangeEnd);
  let paymentsQuery = client
    .from('room_payments')
    .select('amount')
    .gte('received_at', rangeStart)
    .lte('received_at', rangeEnd);

  if (bizId) {
    bookingsQuery = bookingsQuery.eq('business_id', bizId);
    chargesQuery = chargesQuery.eq('business_id', bizId);
    paymentsQuery = paymentsQuery.eq('business_id', bizId);
  }

  const [bookingsResult, chargesResult, paymentsResult] = await Promise.all([
    bookingsQuery,
    chargesQuery,
    paymentsQuery,
  ]);
  if (bookingsResult.error) throw bookingsResult.error;
  if (chargesResult.error) throw chargesResult.error;
  // A database that has not yet received the hospitality migration should
  // still be able to render the rest of the reports page.
  if (paymentsResult.error && paymentsResult.error.code !== '42P01') throw paymentsResult.error;

  const accommodationRevenue = (bookingsResult.data || []).reduce((total, booking) => total + Number(booking.room_rate || 0), 0);
  // `amount` is the full line amount (not a unit price); quantity is kept for
  // display and inventory context.
  const folioCharges = (chargesResult.data || []).reduce((total, charge) => total + Number(charge.amount || 0), 0);
  const barAndKitchenCharges = (chargesResult.data || [])
    .filter((charge) => ['bar', 'kitchen', 'food', 'beverage'].includes(String(charge.service_type || '').toLowerCase()))
    .reduce((total, charge) => total + Number(charge.amount || 0), 0);
  const paymentsCollected = (paymentsResult.data || []).reduce((total, payment) => total + Number(payment.amount || 0), 0);

  const result: HospitalitySummary = {
    accommodationRevenue,
    folioCharges,
    barAndKitchenCharges,
    paymentsCollected,
    guestRevenue: accommodationRevenue + folioCharges,
    bookingCount: bookingsResult.data?.length || 0,
  };
  hospitalityReportCache = { key, data: result, timestamp: Date.now() };
  return result;
}

export async function getDebtPaymentsReport(startDate: string, endDate: string, locationId?: string | null, businessId?: string) {
  const bizId = await getEffectiveBusinessId(businessId);
  const key = `${bizId || 'all'}:${startDate}:${endDate}:${locationId || 'all'}`;
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
        business_id,
        created_at,
        customers(full_name),
        cashier:users!sales_cashier_id_fkey(full_name)
      )
    `)
    .gte('paid_at', `${startDate}T00:00:00.000Z`)
    .lte('paid_at', `${endDate}T23:59:59.999Z`)
    .gt('amount', 0);

  if (bizId) paymentsQuery = paymentsQuery.eq('sales.business_id', bizId);
  if (locationId) paymentsQuery = paymentsQuery.eq('sales.location_id', locationId);

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
      cashierName: sale.cashier?.full_name || 'Unknown Cashier',
      date: p.paid_at,
      saleNumber: sale.sale_number
    };
  }) || [];

  const result = debtPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  debtPaymentsCache = { key, data: result, timestamp: Date.now() };
  return result;
}
