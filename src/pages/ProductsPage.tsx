import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useState, useRef } from "react";
import Papa from "papaparse";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import {
  BarChart3,
  Box,
  Eye,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { SectionCard } from "../components/ui/SectionCard";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { supabaseConfigured } from "../lib/supabase";
import {
  createCategory,
  createProduct,
  deleteProduct,
  listCategories,
  listProducts,
  updateProduct,
  bulkImportProducts,
  listAttributes,
  createAttribute,
  deleteAttribute,
  listAttributeValues,
  createAttributeValue,
  deleteAttributeValue,
  type ProductAttribute,
  type ProductAttributeValue
} from "../services/productService";
import { Pagination } from "../components/ui/Pagination";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { getProductAggregates, getProductPurchaseHistory, getProductSaleHistory, type ProductAggregates, type ProductPurchaseHistory, type ProductSaleHistory } from "../services/productReportService";
import { getShopSettingsRecord } from "../services/settingsService";
import { BarcodeLabel, BarcodePrintSheet } from "../components/print/BarcodeLabel";
import { listProductVariants, createProductVariant, deleteProductVariant, type ProductVariant } from "../services/variantService";
import type { Category, ProductFormValues, ProductRecord, ShopSettingsRecord } from "../types/database";
import { useTranslation } from "react-i18next";


const DEFAULT_PROFIT = 30;

const initialValues: ProductFormValues = {
  name: "",
  category_id: "",
  barcode: "",
  measurement: "piece",
  cost_price: "",
  selling_price: "",
  image_url: "",
};

function currency(value: number) {
  return value.toLocaleString();
}

function stockStatus(product: ProductRecord, t: any) {
  if (product.stock_quantity === 0) return t('products.out_of_stock');
  if (product.stock_quantity <= product.reorder_level) return t('products.low_stock');
  return t('products.in_stock');
}


export function ProductsPage() {
  const { t } = useTranslation();
  const { can, hasRole, business, assignedLocations, activeLocationId } = useAuth();

  const { showToast, confirm } = useNotification();
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [reportProduct, setReportProduct] = useState<ProductRecord | null>(null);
  const [reportAggregates, setReportAggregates] = useState<ProductAggregates | null>(null);
  const [saleHistory, setSaleHistory] = useState<ProductSaleHistory[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<ProductPurchaseHistory[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [settings, setSettings] = useState<ShopSettingsRecord | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [profitPercent, setProfitPercent] = useState(DEFAULT_PROFIT);
  const [manualPrice, setManualPrice] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showImportLocationModal, setShowImportLocationModal] = useState(false);
  const [pendingCsvProducts, setPendingCsvProducts] = useState<any[]>([]);
  const [selectedImportLocationId, setSelectedImportLocationId] = useState("");
  const [bulkEnabled, setBulkEnabled] = useState(false);
  const [bulkQuantity, setBulkQuantity] = useState("");
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkPricingMode, setBulkPricingMode] = useState<'fixed' | 'discount_amount' | 'discount_percentage'>('fixed');
  const [bulkDiscountValue, setBulkDiscountValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Variants state
  const [showAttributeModal, setShowAttributeModal] = useState(false);
  const [attributes, setAttributes] = useState<ProductAttribute[]>([]);
  const [selectedAttribute, setSelectedAttribute] = useState<ProductAttribute | null>(null);
  const [attributeValues, setAttributeValues] = useState<ProductAttributeValue[]>([]);
  const [newAttributeName, setNewAttributeName] = useState("");
  const [newAttributeValue, setNewAttributeValue] = useState("");
  
  const [productVariants, setProductVariants] = useState<ProductVariant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [newVariantLabel, setNewVariantLabel] = useState("");
  const [newVariantPrice, setNewVariantPrice] = useState("");
  const [newVariantSku, setNewVariantSku] = useState("");
  const [savingVariant, setSavingVariant] = useState(false);
  const [showBarcodeSheet, setShowBarcodeSheet] = useState(false);
  
  const ITEMS_PER_PAGE = 10;
  const { error, isSubmitting, run, setError } = useAsyncAction();
  const canAddProducts = can("Products", "add");
  const canEditProducts = can("Products", "edit");
  const canDeleteProducts = can("Products", "delete");

  const loadProductReport = useCallback(async (product: ProductRecord) => {
    setReportLoading(true);
    setVariantsLoading(true);
    try {
      const [sales, purchases, aggregates, variants] = await Promise.all([
        getProductSaleHistory(product.id),
        getProductPurchaseHistory(product.id),
        getProductAggregates(product.id),
        listProductVariants(product.id),
      ]);
      setSaleHistory(sales);
      setPurchaseHistory(purchases);
      setReportAggregates(aggregates);
      setProductVariants(variants);
    } catch (error) {
      console.error('Failed to load product report:', error);
      setSaleHistory([]);
      setPurchaseHistory([]);
      setReportAggregates(null);
      setProductVariants([]);
    } finally {
      setReportLoading(false);
      setVariantsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) {
      return;
    }

    void run(async () => {
      setLoading(true);
      try {
        const [loadedProducts, loadedCategories, loadedSettings] = await Promise.all([
          listProducts(activeLocationId),
          listCategories(),
          getShopSettingsRecord(),
        ]);
        setProducts(loadedProducts || []);
        setCategories(loadedCategories || []);
        setSettings(loadedSettings);
        if (loadedSettings) {
          setProfitPercent(loadedSettings.default_profit_percentage || DEFAULT_PROFIT);
        }
      } catch (err) {
        console.error("Failed to load products page:", err);
      } finally {
        setLoading(false);
      }
    });
  }, [run, activeLocationId]);

  useEffect(() => {
    if (reportProduct) {
      loadProductReport(reportProduct);
    }
  }, [reportProduct, loadProductReport]);

  // Logic to handle dynamic bulk pricing recalculation
  const [prevUnitPrice, setPrevUnitPrice] = useState<number>(0);

  useEffect(() => {
    if (!bulkEnabled) return;

    const unitPrice = Number(values.selling_price || 0);
    const qty = Number(bulkQuantity || 0);
    if (qty <= 1 || unitPrice <= 0) return;

    const normalTotal = qty * unitPrice;

    if (bulkPricingMode === 'discount_amount') {
      const discount = Number(bulkDiscountValue || 0);
      setBulkPrice(String(Math.max(0, Math.round(normalTotal - discount))));
    } else if (bulkPricingMode === 'discount_percentage') {
      const discountPercent = Number(bulkDiscountValue || 0);
      setBulkPrice(String(Math.max(0, Math.round(normalTotal * (1 - discountPercent / 100)))));
    } else if (bulkPricingMode === 'fixed') {
      // Requirement: New Bulk Price = (Bulk Qty * New Unit Price) - Previous Discount Value
      // We only recalculate if the unit price has actually changed
      if (prevUnitPrice > 0 && unitPrice !== prevUnitPrice) {
        const currentBulkPrice = Number(bulkPrice || 0);
        const previousNormalTotal = qty * prevUnitPrice;
        const previousDiscountValue = previousNormalTotal - currentBulkPrice;
        
        const newBulkPrice = normalTotal - previousDiscountValue;
        setBulkPrice(String(Math.max(0, Math.round(newBulkPrice))));
      }
    }
    
    setPrevUnitPrice(unitPrice);
  }, [values.selling_price, bulkQuantity, bulkPricingMode, bulkDiscountValue, bulkEnabled]);

  // Real-time synchronization for Products Page
  useRealtimeSync({
    onProductChanged: () => {
      // Refresh products and categories from DB
      run(async () => {
        const [loadedProducts, loadedCategories] = await Promise.all([
          listProducts(activeLocationId),
          listCategories(),
        ]);
        setProducts(loadedProducts || []);
        setCategories(loadedCategories || []);
      });
    },
    onStockChanged: () => {
      // Refresh products to show updated stock
      run(async () => {
        const loadedProducts = await listProducts(activeLocationId);
        setProducts(loadedProducts || []);
      });
    },
    onCategoryChanged: () => {
      // Refresh categories list
      run(async () => {
        const loadedCategories = await listCategories();
        setCategories(loadedCategories || []);
      });
    }
  });

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(search.toLowerCase()) ||
        (product.barcode ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        categoryFilter === "all" ? true : product.category_id === categoryFilter;
      const status = stockStatus(product, t);
      const matchesStock =
        stockFilter === "all"
          ? true
          : stockFilter === "low"
            ? status === t('products.low_stock')
            : stockFilter === "in"
              ? status === t('products.in_stock')
              : status === t('products.out_of_stock');


      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [categoryFilter, products, search, stockFilter]);

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, stockFilter]);

  function openCreateModal() {
    setValues({
      ...initialValues,
      is_parent: false,
      parent_id: null,
      variant_combination: null
    });
    setEditingProduct(null);
    setImagePreview("");
    setProfitPercent(settings?.default_profit_percentage ?? DEFAULT_PROFIT);
    setManualPrice(false);
    setBulkQuantity("");
    setBulkPrice("");
    setBulkPricingMode('fixed');
    setBulkDiscountValue("");
    setShowModal(true);
  }

  function openEditModal(product: ProductRecord) {
    setEditingProduct(product);
    setValues({
      name: product.name,
      category_id: product.category_id ?? "",
      barcode: product.barcode ?? "",
      measurement: "piece",
      cost_price: String(product.cost_price),
      selling_price: String(product.selling_price),
      image_url: product.image_url ?? "",
    });
    setImagePreview(product.image_url ?? "");
    setManualPrice(true);
    // Pre-fill bulk pricing
    const hasBulk = product.bulk_quantity != null && product.bulk_quantity > 0;
    setBulkEnabled(hasBulk);
    setBulkQuantity(hasBulk ? String(product.bulk_quantity) : "");
    setBulkPrice(hasBulk ? String(product.bulk_price) : "");
    setBulkPricingMode(product.bulk_pricing_mode || 'fixed');
    setBulkDiscountValue(product.bulk_discount_value ? String(product.bulk_discount_value) : "");
    setShowModal(true);
  }

  function updateValues<K extends keyof ProductFormValues>(
    key: K,
    value: ProductFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleCostOrProfitChange(nextCost: string, nextProfit: number) {
    updateValues("cost_price", nextCost);
    setProfitPercent(nextProfit);

    if (!manualPrice) {
      const cost = Number(nextCost || 0);
      updateValues("selling_price", String(Math.round(cost + cost * (nextProfit / 100))));
    }
  }

  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setImagePreview(preview);
    updateValues("image_url", preview);
  }

  function handleExportTemplate() {
    const template = [
      {
        name: "Sample Product",
        category_id: categories[0]?.id || "",
        barcode: "123456789",
        measurement: "piece",
        cost_price: "100",
        selling_price: "130",
        initial_stock: "10",
        reorder_level: "5"
      }
    ];
    const csv = Papa.unparse(template);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "products_template.csv");
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
  }

  function handleCsvUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[];
        if (rows.length === 0) return;
        
        const hasStock = rows.some((r: any) => Number(r.initial_stock || 0) > 0);
        setPendingCsvProducts(rows);
        
        if (hasStock) {
          setShowImportLocationModal(true);
        } else {
          executeBulkImport(rows, null);
        }
      },
      error: (error: any) => {
        showToast("error", "Error parsing CSV: " + error.message);
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function executeBulkImport(productsToImport: any[], locationId: string | null) {
    if (!business?.id) return;
    await run(async () => {
      await bulkImportProducts(business.id, locationId, productsToImport);
      showToast("success", "Products imported successfully");
      setShowImportLocationModal(false);
      setPendingCsvProducts([]);
      
      const [loadedProducts, loadedCategories] = await Promise.all([
        listProducts(activeLocationId),
        listCategories(),
      ]);
      setProducts(loadedProducts || []);
      setCategories(loadedCategories || []);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const barcodeTaken = products.some(
      (product) =>
        product.barcode &&
        product.barcode === values.barcode &&
        product.id !== editingProduct?.id,
    );

    if (!values.name.trim()) {
      setError("Product name is required.");
      return;
    }

    if (Number.isNaN(Number(values.cost_price)) || Number.isNaN(Number(values.selling_price))) {
      setError("Prices must be valid numbers.");
      return;
    }

    if (barcodeTaken) {
      setError("Barcode must be unique.");
      return;
    }

    await run(async () => {
      const productValues: ProductFormValues = {
        ...values,
        bulk_quantity: bulkEnabled && bulkQuantity ? bulkQuantity : null,
        bulk_price: bulkEnabled && bulkPrice ? bulkPrice : null,
        bulk_pricing_mode: bulkEnabled ? bulkPricingMode : 'fixed',
        bulk_discount_value: bulkEnabled ? bulkDiscountValue : 0,
      };
      if (editingProduct) {
        const updated = await updateProduct(editingProduct.id, productValues);
        setProducts((current) =>
          current.map((product) => (product.id === updated.id ? updated : product)),
        );
      } else {
        const product = await createProduct(productValues);
        setProducts((current) => [product, ...current]);
      }

      showToast("success", editingProduct ? "Product updated successfully!" : "Product created successfully!");
      setShowModal(false);
      setValues(initialValues);
      setEditingProduct(null);
      setImagePreview("");
      setBulkEnabled(false);
      setBulkQuantity("");
      setBulkPrice("");
    });
  }

  async function handleDelete(productId: string) {
    const confirmed = await confirm("Delete Product", "Are you sure you want to permanentely delete this product? This will remove all associated records.");
    if (!confirmed) return;

    await run(async () => {
      await deleteProduct(productId);
      setProducts((current) => current.filter((product) => product.id !== productId));
      showToast("success", "Product deleted.");
    });
  }

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryName.trim()) return;
    if (!canAddProducts) {
      showToast("error", "You don't have permission to create categories.");
      return;
    }

    await run(async () => {
      const category = await createCategory(categoryName);
      setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name)));
      setValues((current) => ({ ...current, category_id: category.id }));
      setCategoryName("");
      setShowCategoryModal(false);
      showToast("success", "Category created.");
    });
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6">

      <SectionCard title={t('products.title')} subtitle={t('products.subtitle')}>

        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid flex-1 gap-3 md:grid-cols-3">
            <label className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
              <Search size={16} className="text-brand-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full border-none bg-transparent text-sm outline-none"
                placeholder={t('products.search_placeholder')}
              />
            </label>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none"
            >
              <option value="all">{t('products.filter_category')}</option>

              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
              className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none"
            >
              <option value="all">{t('products.filter_stock')}</option>
              <option value="in">{t('products.in_stock')}</option>
              <option value="low">{t('products.low_stock')}</option>
              <option value="out">{t('products.out_of_stock')}</option>
            </select>

          </div>
          {canAddProducts && (
            <div className="flex items-center gap-2">
              <input type="file" accept=".csv" ref={fileInputRef} onChange={handleCsvUpload} className="hidden" />
              <button
                onClick={handleExportTemplate}
                className="flex items-center justify-center gap-2 rounded-2xl border border-brand-200 bg-white px-5 py-3 text-sm font-semibold text-brand-600"
              >
                {t('products.export_csv')}
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-2xl border border-brand-200 bg-white px-5 py-3 text-sm font-semibold text-brand-600"
              >
                {t('products.import_csv')}
              </button>

              <button
                onClick={() => {
                  setShowAttributeModal(true);
                  void run(async () => {
                    const attrs = await listAttributes();
                    setAttributes(attrs);
                  });
                }}
                className="flex items-center justify-center gap-2 rounded-2xl border border-brand-200 bg-white px-5 py-3 text-sm font-semibold text-brand-600"
              >
                {t('products.attributes')}
              </button>
              <button
                onClick={openCreateModal}
                className="flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white"
              >
                <Plus size={16} />
                {t('products.new_product')}
              </button>
            </div>

          )}
        </div>

        <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-[0_20px_50px_rgba(37,99,235,0.08)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                <tr>
                  {[
                    t('products.table.name'),
                    t('products.table.category'),
                    t('products.table.cost'),
                    t('products.table.price'),
                    t('products.table.stock'),
                    t('common.actions')
                  ].map((column) => (
                    <th key={column} className="border-b border-white/10 px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-100">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="bg-white">
                {loading ? (
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                      {t('products.loading')}
                    </td>
                ) : paginatedProducts.length ? (
                  paginatedProducts.map((product) => {
                    const status = stockStatus(product, t);
                    const lowStock = status === t('products.low_stock') || status === t('products.out_of_stock');


                    return (
                      <tr key={product.id} className="transition hover:bg-brand-50/40">
                        <td className="border-b border-slate-100 px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 to-brand-50 ring-1 ring-slate-100">
                              {product.image_url ? (
                                <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                              ) : (
                                <Box size={18} className="text-slate-400" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-ink">{product.name}</p>
                                {product.bulk_quantity && product.bulk_quantity > 0 && (
                                  <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-700" title={`Bulk: ${product.bulk_quantity} units = ${product.bulk_price?.toLocaleString()} RWF`}>
                                    Bulk
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400">{product.barcode ?? "No barcode"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-5 py-4 text-slate-600">
                          {categoryMap.get(product.category_id ?? "") ?? "Uncategorized"}
                        </td>
                        <td className="border-b border-slate-100 px-5 py-4 text-slate-600">{currency(product.cost_price)}</td>
                        <td className="border-b border-slate-100 px-5 py-4 font-semibold text-brand-600">{currency(product.selling_price)}</td>
                        <td className="border-b border-slate-100 px-5 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${lowStock ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
                            {product.stock_quantity} - {status}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-5 py-4">
                            <div className="flex items-center gap-2">
                            {canEditProducts && (
                              <button onClick={() => openEditModal(product)} className="rounded-xl bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200">
                                <Pencil size={16} />
                              </button>
                            )}
                            {canDeleteProducts && (
                              <button onClick={() => void handleDelete(product.id)} className="rounded-xl bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100">
                                <Trash2 size={16} />
                              </button>
                            )}
                            <button onClick={() => setReportProduct(product)} className="rounded-xl bg-brand-50 p-2 text-brand-600 transition hover:bg-brand-100" title="View Report">
                              <Eye size={16} />
                            </button>
                            <button onClick={() => handlePrint()} className="rounded-xl bg-orange-50 p-2 text-orange-600 transition hover:bg-orange-100" title="Print Details">
                              <Printer size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                      {t('products.no_results')}
                    </td>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredProducts.length}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setCurrentPage}
          />
        </div>
      </SectionCard>

      {showModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-3xl rounded-[2rem] border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-600">{t('products.modal.form_title')}</p>
                <h2 className="mt-2 text-2xl font-bold text-ink">{editingProduct ? t('products.modal.edit_title') : t('products.modal.create_title')}</h2>
              </div>

              <button onClick={() => setShowModal(false)} className="rounded-full bg-slate-100 p-2 text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]" onSubmit={handleSubmit}>
              <div className="space-y-3">
                <div className="rounded-3xl border border-sky-100 bg-sky-50/80 p-3.5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">{t('products.modal.basic_info')}</p>
                  <div className="space-y-2.5">
                    <input value={values.name} onChange={(event) => updateValues("name", event.target.value)} className="w-full rounded-2xl border border-sky-100 bg-white px-4 py-2.5 text-sm outline-none" placeholder={t('products.modal.name')} required />
                    <input value={values.barcode} onChange={(event) => updateValues("barcode", event.target.value)} className="w-full rounded-2xl border border-sky-100 bg-white px-4 py-2.5 text-sm outline-none" placeholder={t('products.modal.barcode')} />
                  </div>
                </div>


                <div className="rounded-3xl border border-violet-100 bg-violet-50/80 p-3.5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">{t('products.modal.category_unit')}</p>
                  <div className="grid gap-2.5 sm:grid-cols-[1fr_auto]">
                    <select value={values.category_id} onChange={(event) => updateValues("category_id", event.target.value)} className="rounded-2xl border border-violet-100 bg-white px-4 py-2.5 text-sm outline-none">
                      <option value="">{t('products.modal.select_category')}</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => setShowCategoryModal(true)}
                      disabled={!canAddProducts}
                      title={!canAddProducts ? "You don't have permission to add categories." : t('products.modal.add_category')}
                      className="rounded-2xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('products.modal.add_category')}
                    </button>

                  </div>

                  <div className="mt-2.5">
                    <label className="text-sm font-semibold text-violet-700">{t('products.modal.measurement')}</label>
                    <div className="mt-2 flex gap-2.5">
                      {[
                        { value: "kg", label: "Kg" },
                        { value: "piece", label: "Piece" },
                      ].map((option) => (
                        <button
                        key={option.value}
                        type="button"
                        onClick={() => updateValues("measurement", option.value as "kg" | "piece")}
                          className={`rounded-2xl px-4 py-2 text-sm font-semibold ${values.measurement === option.value ? "bg-violet-600 text-white" : "bg-white text-slate-700 ring-1 ring-violet-100"}`}
                        >
                          {option.label}
                      </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-emerald-100 bg-emerald-50/80 p-3.5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{t('products.modal.pricing')}</p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <input value={values.cost_price} onChange={(event) => handleCostOrProfitChange(event.target.value, profitPercent)} className="rounded-2xl border border-emerald-100 bg-white px-4 py-2.5 text-sm outline-none" placeholder={t('products.modal.cost_price')} type="number" min="0" step="0.01" required />
                    <input value={values.selling_price} onChange={(event) => { setManualPrice(true); updateValues("selling_price", event.target.value); }} className="rounded-2xl border border-emerald-100 bg-white px-4 py-2.5 text-sm outline-none" placeholder={t('products.modal.selling_price')} type="number" min="0" step="0.01" required />
                  </div>
                </div>


                {/* --- Phase 4: Product Variants Section --- */}
                <div className={`rounded-3xl border p-3.5 transition-all ${values.parent_id ? "border-brand-200 bg-brand-50/60" : "border-slate-100 bg-slate-50/40"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Product Type</p>
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => updateValues("is_parent", !values.is_parent)}
                        className={`rounded-lg px-2 py-1 text-[10px] font-bold uppercase transition-all ${values.is_parent ? "bg-brand-500 text-white shadow-sm" : "bg-white text-slate-400 border border-slate-200"}`}
                      >
                        Parent Product
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={!!values.parent_id} 
                        onChange={(e) => updateValues("parent_id", e.target.checked ? "select" : null)} 
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-sm font-medium text-slate-700">This is a Variant</span>
                    </label>
                    
                    {values.parent_id && (
                      <div className="mt-3 space-y-3 animate-fade-in">
                        <select 
                          value={values.parent_id === "select" ? "" : values.parent_id}
                          onChange={(e) => updateValues("parent_id", e.target.value)}
                          className="w-full rounded-2xl border border-brand-100 bg-white px-4 py-2.5 text-sm outline-none"
                        >
                          <option value="">{t('products.modal.select_parent')}</option>
                          {products.filter(p => p.is_parent && p.id !== editingProduct?.id).map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        
                        {values.parent_id !== "select" && (
                          <div className="rounded-2xl bg-white border border-brand-100 p-3">
                            <p className="text-[10px] font-bold uppercase text-brand-600 mb-2">Variant Options (JSON)</p>
                            <textarea 
                              value={typeof values.variant_combination === 'string' ? values.variant_combination : JSON.stringify(values.variant_combination || { "Size": "", "Color": "" }, null, 2)}
                              onChange={(e) => {
                                try {
                                  const parsed = JSON.parse(e.target.value);
                                  updateValues("variant_combination", parsed);
                                } catch {
                                  updateValues("variant_combination", e.target.value);
                                }
                              }}
                              className="w-full h-20 rounded-xl bg-slate-50 p-3 text-xs font-mono outline-none border-none"
                              placeholder='{"Size": "Large", "Color": "Blue"}'
                            />
                            <p className="mt-1 text-[9px] text-slate-400 italic font-medium">Use Attribute Manager to define names, then enter values above.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ─── Bulk Pricing Section (requires Products > Edit permission) ─── */}
                {canEditProducts && (
                  <div className={`rounded-3xl border p-3.5 transition-all duration-200 ${bulkEnabled ? "border-indigo-200 bg-indigo-50/80" : "border-slate-200 bg-slate-50/60"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">{t('products.modal.bulk_pricing')}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{t('products.modal.bulk_subtitle')}</p>
                      </div>

                      {/* Toggle switch */}
                      <button
                        type="button"
                        onClick={() => {
                          setBulkEnabled(!bulkEnabled);
                          if (!bulkEnabled) {
                            setBulkQuantity("");
                            setBulkPrice("");
                            setBulkPricingMode('fixed');
                            setBulkDiscountValue("");
                          }
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${bulkEnabled ? "bg-indigo-600" : "bg-slate-300"}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${bulkEnabled ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </div>

                    {bulkEnabled && (
                      <div className="space-y-4 mt-3 animate-fade-in">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">Package Quantity</label>
                            <input
                              type="number"
                              min="2"
                              step="1"
                              value={bulkQuantity}
                              onChange={(e) => setBulkQuantity(e.target.value)}
                              className="w-full rounded-2xl border border-indigo-100 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-400 transition"
                              placeholder="e.g. 12"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">Pricing Mode</label>
                            <select
                              value={bulkPricingMode}
                              onChange={(e) => setBulkPricingMode(e.target.value as any)}
                              className="w-full rounded-2xl border border-indigo-100 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-400 transition"
                            >
                              <option value="fixed">Fixed Price</option>
                              <option value="discount_amount">Discount Amount</option>
                              <option value="discount_percentage">Discount Percentage (%)</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">
                              {bulkPricingMode === 'fixed' ? 'Fixed Package Price' : bulkPricingMode === 'discount_amount' ? 'Discount Amount' : 'Discount Percentage (%)'}
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={bulkPricingMode === 'fixed' ? bulkPrice : bulkDiscountValue}
                              onChange={(e) => {
                                if (bulkPricingMode === 'fixed') {
                                  setBulkPrice(e.target.value);
                                } else {
                                  setBulkDiscountValue(e.target.value);
                                }
                              }}
                              className="w-full rounded-2xl border border-indigo-100 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-400 transition"
                              placeholder={bulkPricingMode === 'fixed' ? 'e.g. 5500' : bulkPricingMode === 'discount_amount' ? 'e.g. 500' : 'e.g. 10'}
                            />
                          </div>
                          <div className="flex flex-col justify-end">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Effective Package Price</label>
                            <div className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700">
                              {(() => {
                                let calculated = Number(bulkPrice);
                                const qty = Number(bulkQuantity || 0);
                                const unit = Number(values.selling_price || 0);
                                const discount = Number(bulkDiscountValue || 0);

                                if (bulkPricingMode === 'discount_amount') {
                                  calculated = (qty * unit) - discount;
                                } else if (bulkPricingMode === 'discount_percentage') {
                                  calculated = (qty * unit) * (1 - (discount / 100));
                                }

                                if (isNaN(calculated) || calculated <= 0) return "---";
                                return Math.round(calculated).toLocaleString() + " RWF";
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Live preview and validation */}
                        {bulkQuantity && Number(bulkQuantity) > 1 && Number(values.selling_price) > 0 && (() => {
                          const unitPrice = Number(values.selling_price);
                          const qty = Number(bulkQuantity);
                          const normalTotal = qty * unitPrice;
                          
                          let calculatedPrice = Number(bulkPrice);
                          const discount = Number(bulkDiscountValue || 0);

                          if (bulkPricingMode === 'discount_amount') {
                            calculatedPrice = normalTotal - discount;
                          } else if (bulkPricingMode === 'discount_percentage') {
                            calculatedPrice = normalTotal * (1 - (discount / 100));
                          }

                          const saving = normalTotal - calculatedPrice;
                          const isCheaper = calculatedPrice < normalTotal && calculatedPrice > 0;

                          return (
                            <div className={`rounded-2xl p-3 text-xs font-semibold ${isCheaper ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"}`}>
                              {isCheaper ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">✅</span>
                                  <div>
                                    <p>Package pricing is valid.</p>
                                    <p className="opacity-75">Customer saves {Math.round(saving).toLocaleString()} RWF ({( (saving/normalTotal)*100 ).toFixed(1)}%) per package.</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">⚠️</span>
                                  <div>
                                    <p>Invalid Package Price!</p>
                                    <p className="opacity-75">The package price must be less than the individual total of {normalTotal.toLocaleString()} RWF.</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-3xl border border-brand-100 bg-brand-50 p-3.5">
                  <div className="flex items-start gap-3">
                    <Tag size={18} className="mt-0.5 text-brand-600" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-brand-700">{t('settings.finance.profit_label')}</p>
                      <p className="mt-1 text-xs text-brand-700/80">{t('settings.finance.profit_applied')}</p>
                      <div className="mt-2.5 inline-block rounded-xl border border-brand-200 bg-white/50 px-3 py-2 text-sm font-medium text-brand-800">
                        {profitPercent}% (Set by Admin)
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-3xl border border-amber-100 bg-amber-50/80 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">{t('settings.business.logo')}</p>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="mt-3 block w-full text-sm text-slate-500" />
                  <input value={values.image_url} onChange={(event) => { updateValues("image_url", event.target.value); setImagePreview(event.target.value); }} className="mt-2.5 w-full rounded-2xl border border-amber-100 bg-white px-4 py-2.5 text-sm outline-none" placeholder="Or paste image URL" />
                  <div className="mt-3 flex h-32 items-center justify-center overflow-hidden rounded-3xl bg-white ring-1 ring-amber-100">
                    {imagePreview ? <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" /> : <span className="text-sm text-slate-400">Image preview</span>}
                  </div>
                </div>

                <div className="rounded-3xl border border-indigo-100 bg-indigo-50/80 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">{t('settings.finance.title')}</p>
                  <p className="mt-2 text-sm text-slate-600">{t('products.modal.pricing_formula')}</p>
                  <p className="mt-2 text-lg font-bold text-indigo-700">{currency(Number(values.selling_price || 0))}</p>
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">{t('common.cancel')}</button>
                  <button type="submit" disabled={!supabaseConfigured || isSubmitting} className="flex-1 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                    {isSubmitting ? t('common.saving') : t('products.modal.save_btn')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showCategoryModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm" onClick={() => setShowCategoryModal(false)}>
          <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-ink">{t('products.modal.add_category_title')}</h3>
            <form className="mt-4 space-y-4" onSubmit={handleCreateCategory}>
              <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" placeholder={t('products.modal.cat_name')} required />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowCategoryModal(false)} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">{t('common.cancel')}</button>
                <button type="submit" className="flex-1 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white">{t('products.modal.save_category')}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {reportProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setReportProduct(null)}>
          <div className="w-full max-w-5xl rounded-[2rem] bg-white p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-600">{t('products.report.title')}</p>
                <h2 className="mt-2 text-2xl font-bold text-ink">{t('products.products')}: {reportProduct.name}</h2>
              </div>
              <button onClick={() => setReportProduct(null)} className="rounded-full bg-slate-100 p-2 text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-5">
              {[
                [t('products.table.category'), categoryMap.get(reportProduct.category_id ?? "") ?? t('products.uncategorized')],
                [t('products.table.cost'), currency(reportProduct.cost_price)],
                [t('products.table.price'), currency(reportProduct.selling_price)],
                [t('products.table.stock'), String(reportProduct.stock_quantity)],
                [t('products.modal.barcode'), reportProduct.barcode ?? "N/A"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-2 text-lg font-bold text-ink">{value}</p>
                </div>
              ))}
            </div>

            {reportAggregates && (
              <div className="mt-6 rounded-3xl border border-brand-100 bg-brand-50/50 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600 mb-4">{t('products.report.performance')}</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl bg-white p-4 shadow-sm border border-brand-100">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t('products.report.total_sold')}</p>
                    <p className="mt-2 text-2xl font-bold text-brand-600">{reportAggregates.total_sold} <span className="text-xs text-slate-400 font-normal">{t('products.units.piece')}s</span></p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm border border-brand-100">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t('products.report.total_revenue')}</p>
                    <p className="mt-2 text-2xl font-bold text-emerald-600">{currency(reportAggregates.total_revenue)}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm border border-brand-100">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t('reports.profit')}</p>
                    <p className="mt-2 text-2xl font-bold text-indigo-600">
                      {currency(reportAggregates.total_revenue - (reportAggregates.total_sold * (Number(reportProduct.cost_price) || 0)))}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm border border-brand-100">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t('products.report.purchase_vol')}</p>
                    <p className="mt-2 text-2xl font-bold text-amber-600">{reportAggregates.total_purchased} <span className="text-xs text-slate-400 font-normal">{t('products.units.piece')}s</span></p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className="rounded-[2rem] border border-brand-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-ink">{t('products.report.sales_history')}</h3>
                  <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">{t('products.report.recent_sales')}</div>
                </div>
                {reportLoading ? (
                  <div className="py-8 text-center text-slate-500">Loading sales history...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-50">
                          {[t('common.date'), t('sales.details.qty'), t('products.table.price'), t('common.total'), t('sales.details.customer')].map((column) => (
                            <th key={column} className="pb-3 text-xs font-semibold uppercase tracking-wider">{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {saleHistory.length > 0 ? (
                          saleHistory.map((sale, index) => (
                            <tr key={index}>
                              <td className="py-3">{sale.date}</td>
                              <td className="py-3">{sale.qty}</td>
                              <td className="py-3">{currency(sale.price)}</td>
                              <td className="py-3">{currency(sale.total)}</td>
                              <td className="py-3">{sale.customer}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-500">
                              {t('products.report.no_sales')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-[2rem] border border-brand-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-ink">{t('products.report.purchase_history')}</h3>
                  <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">{t('products.report.inventory_logs')}</div>
                </div>
                {reportLoading ? (
                  <div className="py-8 text-center text-slate-500">Loading purchase history...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-50">
                          {[t('common.date'), t('sales.details.qty'), t('products.table.cost'), t('suppliers.title')].map((column) => (
                            <th key={column} className="pb-3 text-xs font-semibold uppercase tracking-wider">{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {purchaseHistory.length > 0 ? (
                          purchaseHistory.map((purchase, index) => (
                            <tr key={index}>
                              <td className="py-3">{purchase.date}</td>
                              <td className="py-3">{purchase.qty}</td>
                              <td className="py-3">{currency(purchase.cost)}</td>
                              <td className="py-3">{purchase.supplier}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-slate-500">
                              {t('products.report.no_purchases')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* ── Barcode Panel ── */}
            {reportProduct.barcode && (
              <div className="mt-6 rounded-3xl border border-slate-100 bg-slate-50 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <QrCode size={18} className="text-slate-600" />
                    <h3 className="text-base font-bold text-ink">{t('products.modal.barcode')}</h3>
                  </div>
                  <button
                    onClick={() => { setShowBarcodeSheet(true); setTimeout(window.print, 300); }}
                    className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 transition"
                  >
                    <Printer size={14} /> {t('common.print')}
                  </button>
                </div>
                <div className="flex justify-center">
                  <BarcodeLabel
                    value={reportProduct.barcode}
                    productName={reportProduct.name}
                    price={reportProduct.selling_price}
                    height={70}
                    width={2}
                  />
                </div>
              </div>
            )}

            {/* ── Product Variants Panel ── */}
            <div className="mt-6 rounded-3xl border border-indigo-100 bg-indigo-50/40 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-ink">{t('products.modal.variant_options')}</h3>
                <span className="text-xs text-slate-400">{productVariants.length} variant(s)</span>
              </div>

              {/* Add variant form */}
              {canEditProducts && (
                <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                  <input
                    value={newVariantLabel}
                    onChange={(e) => setNewVariantLabel(e.target.value)}
                    className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                    placeholder="e.g. Size: Large, Color: Red"
                  />
                  <input
                    value={newVariantSku}
                    onChange={(e) => setNewVariantSku(e.target.value)}
                    className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm outline-none w-24"
                    placeholder="SKU"
                  />
                  <input
                    type="number" min="0"
                    value={newVariantPrice}
                    onChange={(e) => setNewVariantPrice(e.target.value)}
                    className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm outline-none w-28"
                    placeholder="+Price"
                  />
                  <button
                    disabled={savingVariant || !newVariantLabel.trim()}
                    onClick={async () => {
                      if (!reportProduct || !newVariantLabel.trim()) return;
                      try {
                        setSavingVariant(true);
                        const v = await createProductVariant({
                          product_id: reportProduct.id,
                          variant_label: newVariantLabel,
                          sku: newVariantSku,
                          additional_price: Number(newVariantPrice || 0),
                        });
                        setProductVariants(prev => [...prev, v]);
                        setNewVariantLabel(""); setNewVariantSku(""); setNewVariantPrice("");
                        showToast("success", t('sales.success.updated'));
                      } catch (err: any) {
                        showToast("error", err?.message || t('common.error'));
                      } finally { setSavingVariant(false); }
                    }}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition whitespace-nowrap"
                  >
                    {savingVariant ? t('common.adding') : "+ " + t('common.update')}
                  </button>
                </div>
              )}

              {variantsLoading ? (
                <div className="py-4 text-center text-sm text-slate-400">Loading variants...</div>
              ) : productVariants.length === 0 ? (
                <div className="py-4 text-center text-sm text-slate-400">No variants yet. Add Size, Color, Weight etc.</div>
              ) : (
                <div className="space-y-2">
                  {productVariants.map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-xl bg-white border border-indigo-100 px-4 py-3">
                      <div>
                        <p className="font-semibold text-ink text-sm">{v.variant_label}</p>
                        {v.sku && <p className="text-xs text-slate-400">SKU: {v.sku}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        {v.additional_price !== 0 && (
                          <span className={`text-sm font-bold ${v.additional_price > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {v.additional_price > 0 ? '+' : ''}{v.additional_price.toLocaleString()} RWF
                          </span>
                        )}
                        {canEditProducts && (
                          <button
                            onClick={async () => {
                              await deleteProductVariant(v.id);
                              setProductVariants(prev => prev.filter(pv => pv.id !== v.id));
                              showToast("success", "Variant removed");
                            }}
                            className="rounded-lg bg-rose-50 p-1.5 text-rose-500 hover:bg-rose-100 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      ) : null}

      {/* Barcode Print Sheet (hidden, appears on print) */}
      {showBarcodeSheet && reportProduct?.barcode && (
        <div style={{ display: 'none' }} className="print:block">
          <BarcodePrintSheet
            items={[{ barcode: reportProduct.barcode, name: reportProduct.name, price: reportProduct.selling_price }]}
          />
        </div>
      )}

      {showAttributeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={() => setShowAttributeModal(false)}>
          <div className="w-full max-w-4xl overflow-hidden rounded-[2.5rem] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between bg-brand-50 px-8 py-6">
              <div>
                <h3 className="text-xl font-bold text-ink">{t('products.modal.attr_manager')}</h3>
                <p className="text-sm text-slate-600">{t('products.modal.attr_manager_subtitle')}</p>
              </div>
              <button onClick={() => setShowAttributeModal(false)} className="rounded-full bg-white p-2 text-slate-400 hover:text-ink shadow-sm">
                <X size={20} />
              </button>
            </div>
            
            <div className="grid md:grid-cols-[250px_1fr] h-[500px]">
              {/* Sidebar: Attributes List */}
              <div className="border-r border-slate-100 bg-slate-50/50 p-6 overflow-y-auto">
                <div className="mb-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">New Attribute</label>
                  <div className="flex gap-2">
                    <input
                      value={newAttributeName}
                      onChange={(e) => setNewAttributeName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-200"
                      placeholder="e.g. Size"
                    />
                    <button
                      onClick={() => {
                        if (!newAttributeName.trim()) return;
                        void run(async () => {
                          const attr = await createAttribute(newAttributeName);
                          setAttributes(prev => [...prev, attr]);
                          setNewAttributeName("");
                          showToast("success", "Attribute created");
                        });
                      }}
                      className="rounded-xl bg-brand-500 p-2 text-white shadow-soft"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Your Attributes</label>
                  {attributes.map(attr => (
                    <button
                      key={attr.id}
                      onClick={() => {
                        setSelectedAttribute(attr);
                        void run(async () => {
                          const vals = await listAttributeValues(attr.id);
                          setAttributeValues(vals);
                        });
                      }}
                      className={`group w-full flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${selectedAttribute?.id === attr.id ? "bg-brand-500 text-white shadow-lg shadow-brand-200" : "text-slate-600 hover:bg-slate-100"}`}
                    >
                      {attr.name}
                      <Trash2 
                        size={14} 
                        className={`transition-opacity ${selectedAttribute?.id === attr.id ? "text-white/60 hover:text-white" : "text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100"}`} 
                        onClick={(e) => {
                          e.stopPropagation();
                          void run(async () => {
                            await deleteAttribute(attr.id);
                            setAttributes(prev => prev.filter(a => a.id !== attr.id));
                            if (selectedAttribute?.id === attr.id) setSelectedAttribute(null);
                          });
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Main: Values Management */}
              <div className="p-8 overflow-y-auto">
                {!selectedAttribute ? (
                  <div className="flex h-full flex-col items-center justify-center text-slate-400">
                    <div className="mb-4 rounded-full bg-slate-50 p-6">
                      <Tag size={40} className="text-slate-200" />
                    </div>
                    <p className="text-lg font-medium">Select an attribute</p>
                    <p className="text-sm">Choose an attribute from the left to manage its values</p>
                  </div>
                ) : (
                  <div className="animate-fade-in">
                    <div className="mb-8 flex items-end justify-between border-b border-slate-100 pb-6">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-widest text-brand-600">Managing Values for</span>
                        <h4 className="text-3xl font-black text-ink">{selectedAttribute.name}</h4>
                      </div>
                    </div>

                    <div className="mb-8 rounded-3xl bg-slate-50 p-6">
                      <label className="mb-2 block text-sm font-bold text-slate-700">Add New Value</label>
                      <div className="flex gap-3">
                        <input
                          value={newAttributeValue}
                          onChange={(e) => setNewAttributeValue(e.target.value)}
                          className="flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                          placeholder={`Enter ${selectedAttribute.name} value (e.g. ${selectedAttribute.name === 'Color' ? 'Crimson' : 'Extra Large'})`}
                        />
                        <button
                          onClick={() => {
                            if (!newAttributeValue.trim()) return;
                            void run(async () => {
                              const val = await createAttributeValue(selectedAttribute.id, newAttributeValue);
                              setAttributeValues(prev => [...prev, val]);
                              setNewAttributeValue("");
                              showToast("success", "Value added");
                            });
                          }}
                          className="rounded-2xl bg-ink px-8 text-sm font-bold text-white shadow-soft hover:bg-slate-800"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {attributeValues.map(val => (
                        <div key={val.id} className="group flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-5 py-3 shadow-sm transition-all hover:border-brand-100 hover:shadow-md">
                          <span className="font-semibold text-slate-700">{val.value}</span>
                          <button 
                            onClick={() => void run(async () => {
                              await deleteAttributeValue(val.id);
                              setAttributeValues(prev => prev.filter(v => v.id !== val.id));
                            })}
                            className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500 opacity-0 group-hover:opacity-100"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      {attributeValues.length === 0 && (
                        <div className="col-span-full py-10 text-center text-slate-400 italic">
                          No values defined for this attribute yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showImportLocationModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={() => setShowImportLocationModal(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-brand-50 px-6 py-5">
              <h3 className="text-lg font-bold text-ink">{t('products.modal.import_loc_title')}</h3>
              <p className="mt-1 text-sm text-slate-600">{t('products.modal.import_loc_desc')}</p>
            </div>
            <div className="p-6">
              <select 
                value={selectedImportLocationId} 
                onChange={(e) => setSelectedImportLocationId(e.target.value)}
                className="w-full rounded-2xl border border-brand-100 bg-white px-4 py-3 outline-none"
              >
                <option value="" disabled>Select a location</option>
                {assignedLocations?.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowImportLocationModal(false)}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => executeBulkImport(pendingCsvProducts, selectedImportLocationId)}
                  disabled={isSubmitting || !selectedImportLocationId}
                  className="w-full shadow-soft rounded-2xl bg-brand-500 py-3 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {isSubmitting ? t('products.loading') : t('products.modal.confirm_import')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
