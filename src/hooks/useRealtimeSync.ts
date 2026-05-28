import { useEffect, useRef } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';
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
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  useEffect(() => {
    const realtimeEnabled = import.meta.env.VITE_ENABLE_REALTIME === "true";
    if (!supabaseConfigured || !realtimeEnabled || options.enabled === false) return;

    let destroyed = false;
    const instanceId = Math.random().toString(36).substring(2, 9);
    
    // Create a single multiplexed channel for better performance and to stay within limits
    const channel = supabase.channel(`system-sync-${instanceId}`);

    channel
      // 1. Sales & Finance
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, () => {
        if (destroyed) return;
        const { onSaleCreated } = callbacksRef.current;
        clearDashboardCaches();
        onSaleCreated?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_payments' }, () => {
        if (destroyed) return;
        const { onSaleCreated } = callbacksRef.current;
        clearDashboardCaches();
        onSaleCreated?.();
      })
      
      // 2. Purchases
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'purchases' }, () => {
        if (destroyed) return;
        const { onPurchaseCreated } = callbacksRef.current;
        clearDashboardCaches();
        onPurchaseCreated?.();
      })
      
      // 3. Inventory & Products
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_stocks' }, (payload) => {
        if (destroyed) return;
        const { onStockChanged } = callbacksRef.current;
        onStockChanged?.(payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        if (destroyed) return;
        const { onStockChanged, onProductChanged } = callbacksRef.current;
        onStockChanged?.(payload);
        onProductChanged?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        if (destroyed) return;
        const { onCategoryChanged } = callbacksRef.current;
        onCategoryChanged?.();
      })
      
      // 4. Contacts (Customers/Suppliers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        if (destroyed) return;
        const { onCustomerChanged } = callbacksRef.current;
        onCustomerChanged?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => {
        if (destroyed) return;
        const { onSupplierChanged } = callbacksRef.current;
        onSupplierChanged?.();
      })

      // 5. System & Admin (Settings/Staff/Locations)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_settings' }, () => {
        if (destroyed) return;
        const { onSettingsChanged } = callbacksRef.current;
        onSettingsChanged?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, () => {
        if (destroyed) return;
        const { onLocationChanged } = callbacksRef.current;
        onLocationChanged?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        if (destroyed) return;
        const { onStaffChanged } = callbacksRef.current;
        onStaffChanged?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_permissions' }, () => {
        if (destroyed) return;
        const { onStaffChanged } = callbacksRef.current;
        onStaffChanged?.();
      })

      // 6. POS Specific
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_registers' }, () => {
        if (destroyed) return;
        const { onCashRegisterChanged } = callbacksRef.current;
        onCashRegisterChanged?.();
      })
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn("Realtime sync unavailable; continuing with normal database refresh.", err);
        }
      });

    return () => {
      destroyed = true;
      supabase.removeChannel(channel);
    };
  }, [options.enabled]);
}
