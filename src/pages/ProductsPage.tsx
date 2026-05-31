import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import {
  Package,
  Plus,
  Search,
  Trash2,
  Pencil,
  Filter,
  ArrowRight,
  AlertCircle,
  Download,
  Upload,
  FileText,
  Eye,
  X
} from "lucide-react";
import Papa from "papaparse";
import { SectionCard } from "../components/ui/SectionCard";
import { useAsyncAction } from "../hooks/useAsyncAction";
import {
  deleteProduct,
  listCategories,
  listProducts,
  getProductHistory
} from "../services/productService";
import { listLocations } from "../services/settingsService";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "../lib/format";

export function ProductsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can, activeLocationId, profile, business, assignedLocations } = useAuth();
  const { showToast, confirm } = useNotification();
  
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters State
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState(activeLocationId || "all");
  
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [productHistory, setProductHistory] = useState<{sales: any[], purchases: any[]} | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
  const [historyLoading, setHistoryLoading] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const loadData = async () => {
    setLoading(true);
    try {
      // If locationFilter is "all", we pass null to listProducts to get all products
      const fetchLocId = locationFilter === "all" ? null : locationFilter;
      const [loadedProducts, loadedCategories, loadedLocations] = await Promise.all([
        listProducts(fetchLocId),
        listCategories(),
        listLocations(business?.id)
      ]);
      setProducts(loadedProducts || []);
      setCategories(loadedCategories || []);
      setLocations((loadedLocations?.length ? loadedLocations : assignedLocations) || []);
    } catch (err) {
      console.error("Failed to load products:", err);
      showToast("error", "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProduct && activeTab === 'history') {
      loadHistory();
    }
  }, [selectedProduct, activeTab]);

  const loadHistory = async () => {
    if (!selectedProduct) return;
    setHistoryLoading(true);
    try {
      const history = await getProductHistory(selectedProduct.id);
      setProductHistory(history);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [locationFilter, activeLocationId, business?.id, assignedLocations]);

  useRealtimeSync({
    onProductChanged: loadData,
    onStockChanged: loadData,
    onCategoryChanged: loadData,
    onPurchaseCreated: loadData
  });

  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    // 1. Search Filter (Name, Barcode)
    if (search.trim()) {
      const query = search.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.barcode?.toLowerCase().includes(query)
      );
    }

    // 2. Category Filter
    if (categoryFilter !== "all") {
      filtered = filtered.filter(p => p.category === categoryFilter || p.category_id === categoryFilter);
    }

    // 3. Stock Status Filter
    if (stockFilter === "low") {
      filtered = filtered.filter(p => p.stock_quantity <= (p.reorder_level || 5) && p.stock_quantity > 0);
    } else if (stockFilter === "out") {
      filtered = filtered.filter(p => p.stock_quantity <= 0);
    } else if (stockFilter === "in") {
      filtered = filtered.filter(p => p.stock_quantity > (p.reorder_level || 5));
    }

    return filtered;
  }, [products, search, categoryFilter, stockFilter]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const handleDelete = async (productId: string) => {
    const confirmed = await confirm("Delete Product", "Are you sure you want to delete this product? This action cannot be undone.");
    if (!confirmed) return;

    try {
      await deleteProduct(productId);
      showToast("success", "Product deleted");
      loadData();
    } catch (error: any) {
      showToast("error", error.message || "Failed to delete product");
    }
  };

  const handleExport = () => {
    const data = filteredProducts.map(p => ({
      Name: p.name,
      Category: p.category,
      Barcode: p.barcode || "",
      Cost: p.cost_price,
      Price: p.selling_price,
      Stock: p.stock_quantity
    }));
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `products_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as any[];
        if (rows.length === 0) return;

        const confirmed = await confirm("Import Products", `Are you sure you want to import ${rows.length} products?`);
        if (!confirmed) return;

        try {
          const { bulkImportProducts } = await import("../services/productService");
          await bulkImportProducts(profile?.business_id || "", activeLocationId || null, rows.map(r => ({
            name: r.Name || r.name,
            barcode: r.Barcode || r.barcode,
            cost_price: parseFloat(r.Cost || r.cost_price || 0),
            selling_price: parseFloat(r.Price || r.selling_price || 0),
            initial_stock: parseInt(r.Stock || r.stock_quantity || 0)
          })));
          showToast("success", "Import successful");
          loadData();
        } catch (err: any) {
          showToast("error", "Import failed: " + err.message);
        }
      }
    });
    // Clear input
    e.target.value = "";
  };

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, stockFilter, locationFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink">Products</h1>
          <p className="text-slate-500 text-sm">Manage your inventory, prices and stock levels</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
            <Download size={18} />
            Export
          </button>
          
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
            <Upload size={18} />
            Import
            <input type="file" accept=".csv" onChange={handleImport} className="hidden" />
          </label>

          {can("Products", "add") && (
            <button
              onClick={() => navigate("/products/new")}
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition hover:scale-105 hover:bg-brand-600"
            >
              <Plus size={20} />
              Add Product
            </button>
          )}
        </div>
      </div>

      <SectionCard title="Products List">
        {/* Filters Row */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="relative lg:col-span-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or code..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-brand-500 focus:bg-white transition"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 lg:col-span-3">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:bg-white transition appearance-none"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>

            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:bg-white transition"
            >
              <option value="all">All Stock Status</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
              <option value="in">In Stock</option>
            </select>

            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full rounded-xl border border-brand-100 bg-brand-50 px-3 py-2.5 text-sm font-bold text-brand-700 outline-none focus:border-brand-500 transition"
            >
              <option value="all">Global Stock (All)</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-[0_20px_50px_rgba(37,99,235,0.08)] bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                <tr>
                  <th className="border-b border-white/10 px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-100 first:rounded-tl-3xl">Product Info</th>
                  <th className="border-b border-white/10 px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-100">Category</th>
                  <th className="border-b border-white/10 px-5 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-100">Cost</th>
                  <th className="border-b border-white/10 px-5 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-100">Price</th>
                  <th className="border-b border-white/10 px-5 py-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-100">Stock Level</th>
                  <th className="border-b border-white/10 px-5 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-100 last:rounded-tr-3xl">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white relative">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={6} className="px-6 py-6 h-16 bg-slate-50/20" />
                    </tr>
                  ))
                ) : paginatedProducts.length > 0 ? (
                  paginatedProducts.map((product) => {
                    const isOut = product.stock_quantity <= 0;
                    const isLow = !isOut && product.stock_quantity <= (product.reorder_level || 5);
                    
                    return (
                      <tr key={product.id} className="transition hover:bg-brand-50/40">
                        <td className="border-b border-slate-100 px-5 py-4">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                              {product.image_url ? (
                                <img src={product.image_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-300">
                                  <Package size={20} />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-ink truncate">{product.name}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {product.barcode || 'No Code'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-5 py-4">
                          <div className="inline-block rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
                            {product.category || 'General'}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-5 py-4 text-right font-medium text-slate-400">
                          {formatCurrency(product.cost_price)}
                        </td>
                        <td className="border-b border-slate-100 px-5 py-4 text-right">
                          <p className="text-base font-black text-ink">{formatCurrency(product.selling_price)}</p>
                        </td>
                        <td className="border-b border-slate-100 px-5 py-4 text-center">
                          <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${
                            isOut ? 'bg-rose-50 text-rose-600' :
                            isLow ? 'bg-amber-50 text-amber-600' :
                            'bg-emerald-50 text-emerald-600'
                          }`}>
                            <div className={`h-1.5 w-1.5 rounded-full ${isOut ? 'bg-rose-500 animate-pulse' : isLow ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            {product.stock_quantity} pcs
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-5 py-4 text-right">
                          <div className="flex justify-end gap-2 transition-opacity">
                            <button
                              onClick={() => setSelectedProduct(product)}
                              className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:bg-brand-500 hover:text-white"
                              title="View Details"
                            >
                              <Eye size={18} />
                            </button>
                            {can("Products", "edit") && (
                              <button
                                onClick={() => navigate(`/products/edit/${product.id}`)}
                                className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:bg-brand-500 hover:text-white"
                                title="Edit"
                              >
                                <Pencil size={18} />
                              </button>
                            )}
                            {can("Products", "delete") && (
                              <button
                                onClick={() => handleDelete(product.id)}
                                className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:bg-rose-500 hover:text-white"
                                title="Delete"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-24 text-center">
                      <div className="flex flex-col items-center">
                        <Package size={48} className="mb-4 text-slate-200" />
                        <h3 className="text-lg font-bold text-slate-400">No products found</h3>
                        <p className="text-sm text-slate-400">Try adjusting your filters or adding a new product</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination Row */}
        {filteredProducts.length > ITEMS_PER_PAGE && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} of {filteredProducts.length} items
            </p>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
              >
                Previous
              </button>
              <button
                disabled={currentPage * ITEMS_PER_PAGE >= filteredProducts.length}
                onClick={() => setCurrentPage(p => p + 1)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Product Details Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setSelectedProduct(null)}>
          <div className="w-full max-w-2xl overflow-hidden rounded-[2.5rem] bg-white shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-slate-900 to-brand-800 p-8 text-white">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 overflow-hidden rounded-2xl bg-white/10 p-1">
                    {selectedProduct.image_url ? (
                      <img src={selectedProduct.image_url} alt="" className="h-full w-full rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-white/20">
                        <Package size={40} />
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black">{selectedProduct.name}</h2>
                    <p className="text-sm font-bold text-white/50 uppercase tracking-[0.2em]">{selectedProduct.barcode || 'No Barcode'}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedProduct(null)} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-8">
              <div className="mt-8 flex gap-4 border-b border-slate-100">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`pb-4 text-sm font-black uppercase tracking-widest transition ${activeTab === 'details' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  General Details
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`pb-4 text-sm font-black uppercase tracking-widest transition ${activeTab === 'history' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Activity History
                </button>
              </div>

              {activeTab === 'details' ? (
                <div className="mt-8 grid grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Category</p>
                      <p className="text-lg font-bold text-ink">{selectedProduct.category || 'General'}</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-3xl bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Financials</p>
                      <div className="flex justify-between items-center py-2 border-b border-slate-100">
                        <span className="text-sm text-slate-500">Cost Price</span>
                        <span className="font-bold text-ink">{formatCurrency(selectedProduct.cost_price)}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-sm text-slate-500">Selling Price</span>
                        <span className="text-lg font-black text-brand-600">{formatCurrency(selectedProduct.selling_price)}</span>
                      </div>
                    </div>

                    <div className={`rounded-3xl p-4 ${selectedProduct.stock_quantity <= (selectedProduct.reorder_level || 5) ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Current Inventory</p>
                      <div className="flex justify-between items-center py-2 border-b border-white/50">
                        <span className="text-sm text-slate-500">In Stock</span>
                        <span className={`text-xl font-black ${selectedProduct.stock_quantity <= 0 ? 'text-rose-600' : 'text-ink'}`}>
                          {selectedProduct.stock_quantity} pcs
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-sm text-slate-500">Reorder Level</span>
                        <span className="font-bold text-slate-600">{selectedProduct.reorder_level || 5}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-8 space-y-8 h-[400px] overflow-y-auto pr-2">
                  {historyLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
                    </div>
                  ) : (
                    <>
                      <section>
                        <h3 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-brand-600">Recent Sales</h3>
                        <div className="space-y-3">
                          {productHistory?.sales.length ? productHistory.sales.map((s, i) => (
                            <div key={i} className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 border border-slate-100">
                              <div>
                                <p className="text-sm font-black text-ink">{s.partner}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">{s.reference} • {new Date(s.date).toLocaleDateString()}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-black text-emerald-600">+{s.quantity} pcs</p>
                                <p className="text-xs text-slate-500">{formatCurrency(s.total)}</p>
                              </div>
                            </div>
                          )) : <p className="text-sm text-slate-400 italic">No recent sales recorded.</p>}
                        </div>
                      </section>

                      <section>
                        <h3 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-amber-600">Recent Purchases</h3>
                        <div className="space-y-3">
                          {productHistory?.purchases.length ? productHistory.purchases.map((p, i) => (
                            <div key={i} className="flex items-center justify-between rounded-2xl bg-amber-50/30 p-4 border border-amber-100">
                              <div>
                                <p className="text-sm font-black text-ink">{p.partner}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">{p.reference || 'Stock Count'} • {new Date(p.date).toLocaleDateString()}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-black text-brand-600">-{p.quantity} pcs</p>
                                <p className="text-xs text-slate-500">{formatCurrency(p.total)}</p>
                              </div>
                            </div>
                          )) : <p className="text-sm text-slate-400 italic">No recent purchases recorded.</p>}
                        </div>
                      </section>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'details' && selectedProduct.description && (
                <div className="mt-8">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Description</p>
                  <p className="text-sm text-slate-600 leading-relaxed">{selectedProduct.description}</p>
                </div>
              )}

              <div className="mt-10 flex gap-4">
                <button
                  onClick={() => {
                    navigate(`/products/edit/${selectedProduct.id}`);
                    setSelectedProduct(null);
                    setActiveTab('details');
                  }}
                  className="flex-1 rounded-2xl bg-brand-600 py-4 font-bold text-white shadow-xl shadow-brand-200 transition hover:bg-brand-700"
                >
                  Edit Product
                </button>
                <button
                  onClick={() => {
                    setSelectedProduct(null);
                    setActiveTab('details');
                  }}
                  className="flex-1 rounded-2xl bg-slate-100 py-4 font-bold text-slate-600 transition hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
