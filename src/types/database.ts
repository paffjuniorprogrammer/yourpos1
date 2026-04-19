export type AppRole = "admin" | "manager" | "cashier" | "super_admin";
export type PaymentMethod = "cash" | "momo" | "card" | "bank" | "credit";
export type PaymentStatus = "paid" | "unpaid" | "partial";
export type TransferStatus = "pending" | "in_transit" | "completed";
export type AdjustmentMode = "add" | "subtract";
export type BusinessStatus = "active" | "expired" | "suspended";

export type BusinessRecord = {
  id: string;
  name: string;
  plan_id: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  status: BusinessStatus;
  default_profit_percentage?: number;
  created_at: string;
};

export type UserProfile = {
  id: string;
  auth_user_id: string | null;
  business_id: string;
  full_name: string;
  email: string;
  role: AppRole;
  location_id: string | null;
  location_name?: string | null;
  is_active: boolean;
  created_at: string;
  user_permissions?: UserPermissionRecord[];
  locations?: { name: string } | null;
  assigned_locations?: LocationRecord[];
  business?: BusinessRecord;
};

export type LocationRecord = {
  id: string;
  business_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

export type ProductStockRecord = {
  product_id: string;
  location_id: string;
  business_id: string;
  quantity: number;
};

export type Category = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type ProductRecord = {
  id: string;
  business_id: string;
  category_id: string | null;
  name: string;
  barcode: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  reorder_level: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  bulk_quantity: number | null;
  bulk_price: number | null;
  parent_id: string | null;
  is_parent: boolean;
  variant_combination: any | null;
};

export type CustomerRecord = {
  id: string;
  business_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
};

export type SupplierRecord = {
  id: string;
  business_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tin_number?: string | null;
  payment_term?: string | null;
  bank_account?: string | null;
  created_at: string;
};

export type SaleRecord = {
  id: string;
  business_id: string;
  sale_number: string;
  customer_id: string | null;
  cashier_id: string;
  location_id: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  notes: string | null;
  created_at: string;
};

export type SaleItemRecord = {
  id: string;
  business_id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type SalePaymentRecord = {
  id: string;
  business_id: string;
  sale_id: string;
  payment_method: PaymentMethod;
  amount: number;
  reference: string | null;
  notes: string | null;
  paid_at: string;
};

export type ShopSettingsRecord = {
  id: string;
  business_id: string;
  shop_name: string;
  logo_url: string | null;
  address: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  currency_code: string;
  default_profit_percentage: number;
  tax_percentage: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type UserPermissionRecord = {
  id: string;
  business_id: string;
  user_id: string;
  module_key: string;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_at: string;
};

export type DayClosureRecord = {
  id: string;
  business_id: string;
  user_id: string;
  closing_date: string;
  cash_amount: number;
  momo_amount: number;
  bank_amount: number;
  card_amount: number;
  credit_amount: number;
  total_amount: number;
  created_at: string;
};

export type PosProductRecord = {
  id: string;
  name: string;
  barcode: string | null;
  selling_price: number;
  stock_quantity: number;
  reorder_level: number;
  image_url: string | null;
  category_name: string | null;
  bulk_quantity: number | null;
  bulk_price: number | null;
  parent_id: string | null;
  is_parent: boolean;
  variant_combination: any | null;
};

export type PosCustomerRecord = {
  id: string;
  full_name: string;
  phone: string | null;
};

export type PosSaleItemInput = {
  product_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type PosSalePaymentInput = {
  payment_method: PaymentMethod;
  amount: number;
  reference?: string;
  notes?: string;
};

export type ProductFormValues = {
  name: string;
  category_id: string;
  barcode: string;
  measurement: "kg" | "piece";
  cost_price: string;
  selling_price: string;
  image_url: string;
  bulk_quantity?: string | number | null;
  bulk_price?: string | number | null;
  parent_id?: string | null;
  is_parent?: boolean;
  variant_combination?: any | null;
};

export type CustomerFormValues = {
  full_name: string;
  phone: string;
  email: string;
  address: string;
};

export type SupplierFormValues = {
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
};
