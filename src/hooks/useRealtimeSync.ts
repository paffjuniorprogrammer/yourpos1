import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { clearDashboardCaches } from '../services/dashboardService';

type RealtimeSyncOptions = {
  onSaleCreated?: () => void;
  onPurchaseCreated?: () => void;
  onStockChanged?: (payload: any) => void;
  onCustomerChanged?: () => void;
  onSupplierChanged?: () => void;
  onProductChanged?: () => void;
  onCategoryChanged?: () => void;
  onSettingsChanged?: () => void;
  onStaffChanged?: () => void;
  onLocationChanged?: () => void;
  onCashRegisterChanged?: () => void;
  enabled?: boolean;
};

/**
 * Hook to manage real-time synchronization with Supabase.
 * Listen for changes in key tables and triggers callbacks.
 */
export function useRealtimeSync(options: RealtimeSyncOptions = {}) {
  const {
    onSaleCreated,
    onPurchaseCreated,
    onStockChanged,
    onCustomerChanged,
    onSupplierChanged,
    onProductChanged,
    onCategoryChanged,
    onSettingsChanged,
    onStaffChanged,
    onLocationChanged,
    onCashRegisterChanged,
    enabled = true
  } = options;

  useEffect(() => {
    if (!enabled) return;

    let destroyed = false;
    const instanceId = Math.random().toString(36).substring(2, 9);
    
    // Create a single multiplexed channel for better performance and to stay within limits
    const channel = supabase.channel(`system-sync-${instanceId}`);

    channel
      // 1. Sales & Finance
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, () => {
        if (destroyed) return;
        clearDashboardCaches();
        onSaleCreated?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_payments' }, () => {
        if (destroyed) return;
        clearDashboardCaches();
        onSaleCreated?.();
      })
      
      // 2. Purchases
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'purchases' }, () => {
        if (destroyed) return;
        clearDashboardCaches();
        onPurchaseCreated?.();
      })
      
      // 3. Inventory & Products
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_stocks' }, (payload) => {
        if (destroyed) return;
        onStockChanged?.(payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        if (destroyed) return;
        onStockChanged?.(payload);
        onProductChanged?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        if (destroyed) return;
        onCategoryChanged?.();
      })
      
      // 4. Contacts (Customers/Suppliers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        if (destroyed) return;
        onCustomerChanged?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => {
        if (destroyed) return;
        onSupplierChanged?.();
      })

      // 5. System & Admin (Settings/Staff/Locations)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_settings' }, () => {
        if (destroyed) return;
        onSettingsChanged?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, () => {
        if (destroyed) return;
        onLocationChanged?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        if (destroyed) return;
        onStaffChanged?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_permissions' }, () => {
        if (destroyed) return;
        onStaffChanged?.();
      })

      // 6. POS Specific
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_registers' }, () => {
        if (destroyed) return;
        onCashRegisterChanged?.();
      })
      .subscribe();

    return () => {
      destroyed = true;
      supabase.removeChannel(channel);
    };
  }, [
    enabled, 
    onSaleCreated, 
    onPurchaseCreated, 
    onStockChanged, 
    onCustomerChanged, 
    onSupplierChanged, 
    onProductChanged, 
    onCategoryChanged,
    onSettingsChanged,
    onStaffChanged,
    onLocationChanged,
    onCashRegisterChanged
  ]);
}
