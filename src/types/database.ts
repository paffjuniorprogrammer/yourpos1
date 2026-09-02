export type AppRole = "admin" | "manager" | "cashier" | "super_admin" | "receptionist" | "waiter" | "storekeeper";
export type BusinessType = "retail" | "guesthouse_bar" | "hybrid";
export type PaymentMethod = "cash" | "momo" | "card" | "bank" | "credit" | "room_folio";
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
  business_type?: BusinessType;
  enabled_modules?: Record<string, boolean>;
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
  language?: string | null;
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
  bulk_pricing_mode: 'fixed' | 'discount_amount' | 'discount_percentage' | null;
  bulk_discount_value: number | null;
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
  credit_limit?: number | null;
  discount_percentage?: number | null;
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
  is_vat_registered?: boolean;
  vat_registration_number?: string | null;
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
  vat_rate?: number;
  price_type?: "inclusive" | "exclusive";
  amount_before_vat?: number;
  output_vat?: number;
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
  vat_rate?: number;
  amount_before_vat?: number;
  output_vat?: number;
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
  tin_number?: string | null;
  vat_registration_number?: string | null;
  ebm_serial_number?: string | null;
  vat_registration_status?: "not_registered" | "registered";
  vat_price_type?: "inclusive" | "exclusive";
  tax_period?: "monthly" | "quarterly";
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
  location_id: string | null;
  closing_date: string;
  opened_at: string | null;
  opening_cash: number;
  cash_amount: number;
  momo_amount: number;
  bank_amount: number;
  card_amount: number;
  credit_amount: number;
  total_amount: number;
  status: "open" | "closed";
  closed_at: string | null;
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
  bulk_pricing_mode: 'fixed' | 'discount_amount' | 'discount_percentage' | null;
  bulk_discount_value: number | null;
  parent_id: string | null;
  is_parent: boolean;
  variant_combination: any | null;
};

export type PosCustomerRecord = {
  id: string;
  full_name: string;
  phone: string | null;
  email?: string | null;
  address?: string | null;
  credit_limit?: number | null;
  discount_percentage?: number | null;
  unpaid_balance?: number;
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
  category_id?: string;
  barcode?: string;
  measurement?: "kg" | "piece";
  cost_price: string | number;
  selling_price: string | number;
  image_url?: string;
  bulk_quantity?: string | number | null;
  bulk_price?: string | number | null;
  bulk_pricing_mode?: 'fixed' | 'discount_amount' | 'discount_percentage' | null;
  bulk_discount_value?: string | number | null;
  parent_id?: string | null;
  is_parent?: boolean;
  variant_combination?: any | null;
  location_ids?: string[];
  all_locations?: boolean;
};

export type CustomerFormValues = {
  full_name: string;
  phone: string;
  email: string;
  address: string;
  credit_limit?: string | number | null;
  discount_percentage?: string | number | null;
};

export type SupplierFormValues = {
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
};

export type RoomStatus = 'available' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance';
export type BookingStatus = 'reserved' | 'checked_in' | 'checked_out' | 'cancelled';

export type RoomRecord = {
  id: string;
  business_id: string;
  room_number: string;
  room_type: string;
  price_per_night: number;
  capacity: number;
  status: RoomStatus;
  floor?: string | null;
  notes?: string | null;
  qr_token?: string;
  created_at: string;
  updated_at: string;
  active_booking?: RoomBookingRecord | null;
};

export type RoomBookingRecord = {
  id: string;
  business_id: string;
  room_id: string;
  guest_name: string;
  guest_phone: string | null;
  guest_nationality: string | null;
  guest_id_passport: string | null;
  number_of_guests: number;
  check_in: string;
  check_out: string | null;
  expected_checkout: string | null;
  status: BookingStatus;
  room_rate: number;
  advance_paid: number;
  payment_status: PaymentStatus;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  room?: RoomRecord;
  charges?: RoomChargeRecord[];
  total_charges?: number;
  total_payments?: number;
  balance_remaining?: number;
};

export type RoomChargeRecord = {
  id: string;
  business_id: string;
  booking_id: string;
  sale_id?: string | null;
  service_type: 'bar' | 'food' | 'laundry' | 'room_service' | 'other';
  description: string;
  amount: number;
  quantity: number;
  created_by?: string | null;
  created_at: string;
};

export type RoomPaymentRecord = {
  id: string;
  booking_id: string;
  amount: number;
  payment_method: Exclude<PaymentMethod, 'room_folio' | 'credit'>;
  received_by?: string | null;
  received_at: string;
};

export type DiningTableRecord = {
  id: string;
  business_id: string;
  table_number: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved';
  active_order_id?: string | null;
  is_active: boolean;
  qr_token?: string;
  created_at: string;
};

export type ActiveTabRecord = {
  id: string;
  business_id: string;
  table_id?: string | null;
  booking_id?: string | null;
  customer_id?: string | null;
  tab_name: string;
  cart_items: any[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: 'open' | 'sent_to_kitchen' | 'closed' | 'cancelled';
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  table?: DiningTableRecord;
  booking?: RoomBookingRecord;
};

export type PrinterConfigRecord = {
  id: string;
  business_id: string;
  name: string;
  printer_type: 'bar' | 'kitchen' | 'reception' | 'custom';
  target_categories: string[];
  connection_type: 'browser_print' | 'network_ip' | 'bluetooth';
  ip_address?: string | null;
  paper_width: '80mm' | '58mm' | 'a4';
  is_active: boolean;
  created_at: string;
};

export type HospitalityDayClosureRecord = {
  id: string;
  business_id: string;
  closure_date: string;
  closed_by?: string | null;
  total_sales: number;
  cash_received: number;
  momo_received: number;
  card_received: number;
  room_revenue: number;
  total_expenses: number;
  net_profit: number;
  notes?: string | null;
  created_at: string;
};
