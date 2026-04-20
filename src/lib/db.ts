import Dexie, { type Table } from 'dexie';

export interface PendingAction {
  id: string;          // A unique UUID for the offline action
  payload: any;        // The exact payload meant for Supabase
  type: 'sale' | 'customer' | 'register_open' | 'register_close';
  status: 'pending';   // Status
  created_at: string;  // ISO timestamp
  error?: string | null;  // For tracing synchronization issues
}

export interface CachedProduct {
  id: string; // The product's UUID
  business_id: string;
  data: any; // The full product record
  updated_at: string;
}

export interface CachedCategory {
  id: string;
  data: any;
}

export interface CachedCustomer {
  id: string;
  data: any;
}

export interface CachedCloseDay {
  id: string;
  data: any;
  updated_at: string;
}

export class PosDatabase extends Dexie {
  pending_actions!: Table<PendingAction, string>;
  pending_sales!: Table<PendingAction, string>; // Alias for backward compatibility
  cached_products!: Table<CachedProduct, string>;
  cached_categories!: Table<CachedCategory, string>;
  cached_customers!: Table<CachedCustomer, string>;
  cached_close_day!: Table<CachedCloseDay, string>;

  constructor() {
    super('PosOfflineDB');
    this.version(3).stores({
      pending_actions: 'id, type, status, created_at',
      pending_sales: 'id, status, created_at', // Keep for migration/compatibility
      cached_products: 'id, business_id',
      cached_categories: 'id',
      cached_customers: 'id',
      cached_close_day: 'id'
    });
  }
}

export const db = new PosDatabase();
