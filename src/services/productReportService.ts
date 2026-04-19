import { ensureSupabaseConfigured } from "./supabaseUtils";

export type ProductSaleHistory = {
  date: string;
  qty: number;
  price: number;
  total: number;
  customer: string;
};

export type ProductPurchaseHistory = {
  date: string;
  qty: number;
  cost: number;
  supplier: string;
};

export type ProductAggregates = {
  total_sold: number;
  total_revenue: number;
  total_purchased: number;
  total_cost: number;
  avg_selling_price: number;
};

export async function getProductAggregates(productId: string): Promise<ProductAggregates> {
  const client = await ensureSupabaseConfigured();

  const [salesResult, purchaseResult] = await Promise.all([
    client
      .from('sale_items')
      .select('quantity, line_total')
      .eq('product_id', productId),
    client
      .from('purchase_items')
      .select('quantity, line_total')
      .eq('product_id', productId)
  ]);

  const sales = salesResult.data || [];
  const purchases = purchaseResult.data || [];

  const totalSold = sales.reduce((sum, item) => sum + Number(item.quantity), 0);
  const totalRevenue = sales.reduce((sum, item) => sum + Number(item.line_total), 0);
  const totalPurchased = purchases.reduce((sum, item) => sum + Number(item.quantity), 0);
  const totalCost = purchases.reduce((sum, item) => sum + Number(item.line_total), 0);

  return {
    total_sold: totalSold,
    total_revenue: totalRevenue,
    total_purchased: totalPurchased,
    total_cost: totalCost,
    avg_selling_price: totalSold > 0 ? totalRevenue / totalSold : 0
  };
}


export async function getProductSaleHistory(productId: string): Promise<ProductSaleHistory[]> {
  const client = await ensureSupabaseConfigured();

  const { data, error } = await client
    .from('sale_items')
    .select(`
      quantity,
      unit_price,
      line_total,
      sale_id
    `)
    .eq('product_id', productId)
    .limit(500);

  if (error) throw error;

  // Fetch sale details separately
  const saleIds = [...new Set((data || []).map(item => item.sale_id).filter(Boolean))];
  const { data: sales } = await client
    .from('sales')
    .select('id, sale_number, created_at, customer_id')
    .in('id', saleIds);

  const saleMap = new Map(sales?.map(s => [s.id, s]) ?? []);

  // Fetch customer names
  const customerIds = [...new Set(sales?.map(s => s.customer_id).filter(Boolean) ?? [])];
  const { data: customers } = await client
    .from('customers')
    .select('id, full_name')
    .in('id', customerIds);

  const customerMap = new Map(customers?.map(c => [c.id, c.full_name]) ?? []);

  const history = (data || []).map(item => {
    const sale = saleMap.get(item.sale_id);
    const saleDate = sale ? new Date(sale.created_at) : new Date(0);
    return {
      date: sale ? saleDate.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit'
      }) : '',
      timestamp: saleDate.getTime(),
      qty: Number(item.quantity),
      price: Number(item.unit_price),
      total: Number(item.line_total),
      customer: sale?.customer_id ? customerMap.get(sale.customer_id) || 'Walk-in Customer' : 'Walk-in Customer'
    };
  });

  return history.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10).map(h => {
    const { timestamp, ...rest } = h;
    return rest;
  });
}

export async function getProductPurchaseHistory(productId: string): Promise<ProductPurchaseHistory[]> {
  const client = await ensureSupabaseConfigured();

  const { data, error } = await client
    .from('purchase_items')
    .select(`
      quantity,
      cost_price,
      purchase_id
    `)
    .eq('product_id', productId)
    .limit(500);

  if (error) throw error;

  // Fetch purchase details separately
  const purchaseIds = [...new Set((data || []).map(item => item.purchase_id).filter(Boolean))];
  const { data: purchases } = await client
    .from('purchases')
    .select('id, purchase_date, supplier_id')
    .in('id', purchaseIds);

  const purchaseMap = new Map(purchases?.map(p => [p.id, p]) ?? []);

  // Fetch supplier names
  const supplierIds = [...new Set(purchases?.map(p => p.supplier_id).filter(Boolean) ?? [])];
  const { data: suppliers } = await client
    .from('suppliers')
    .select('id, name')
    .in('id', supplierIds);

  const supplierMap = new Map(suppliers?.map(s => [s.id, s.name]) ?? []);

  const history = (data || []).map(item => {
    const purchase = purchaseMap.get(item.purchase_id);
    const purchaseDate = purchase ? new Date(purchase.purchase_date) : new Date(0);
    return {
      date: purchase ? purchaseDate.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit'
      }) : '',
      timestamp: purchaseDate.getTime(),
      qty: Number(item.quantity),
      cost: Number(item.cost_price),
      supplier: purchase?.supplier_id ? supplierMap.get(purchase.supplier_id) || 'Unknown Supplier' : 'Unknown Supplier'
    };
  });

  return history.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10).map(h => {
    const { timestamp, ...rest } = h;
    return rest;
  });
}