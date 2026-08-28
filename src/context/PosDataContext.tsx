import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { listPosProducts, listPosCustomers, getShopSettings } from '../services/posService';
import type { PosProductRecord, PosCustomerRecord, ShopSettingsRecord } from '../types/database';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { db } from '../lib/db';

type PosDataContextType = {
  products: PosProductRecord[];
  customers: PosCustomerRecord[];
  settings: ShopSettingsRecord | null;
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  updateProductStock: (productId: string, newQuantity: number) => void;
};

const PosDataContext = createContext<PosDataContextType | undefined>(undefined);

export const PosDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeLocationId, authConfigured, profile, isDemoMode } = useAuth();
  const [products, setProducts] = useState<PosProductRecord[]>([]);
  const [customers, setCustomers] = useState<PosCustomerRecord[]>([]);
  const [settings, setSettings] = useState<ShopSettingsRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLocationId, setLastLocationId] = useState<string | null>(null);

  const loadData = useCallback(async (locationId: string, silent = false) => {
    // In demo mode, products are served by posService which already returns DEMO_PRODUCTS.
    // Customers and settings are not needed — but we still call listPosProducts so the
    // POS shelf populates correctly. We skip listPosCustomers & getShopSettings which
    // would fail with the non-UUID demo-business-id.
    if (!authConfigured || !profile) return;

    if (!silent) setLoading(true);
    try {
      if (isDemoMode) {
        // listPosProducts already returns DEMO_PRODUCTS in demo mode
        const demoProducts = await listPosProducts(locationId, 1000);
        setProducts(demoProducts);
        setCustomers([]);
        setSettings({ shop_name: "Kigali Fresh Market (Demo)", logo_url: null } as any);
        setLastLocationId(locationId);
        setError(null);
        return;
      }

      // Publish each result as it arrives. A slow settings response should not
      // make cashiers wait to see products or customers.
      const productsRequest = listPosProducts(locationId, 1000);
      const customersRequest = listPosCustomers();
      const settingsRequest = getShopSettings(profile.business_id);

      void productsRequest.then((nextProducts) => setProducts(nextProducts)).catch(() => undefined);
      void customersRequest.then((nextCustomers) => setCustomers(nextCustomers)).catch(() => undefined);
      void settingsRequest.then((nextSettings) => setSettings(nextSettings)).catch(() => undefined);

      const [nextProducts, nextCustomers, nextSettings] = await Promise.all([
        productsRequest,
        customersRequest,
        settingsRequest,
      ]);
      
      setProducts(nextProducts);
      setCustomers(nextCustomers);
      setSettings(nextSettings);
      setLastLocationId(locationId);
      setError(null);
    } catch (err: any) {
      console.error("Background data load failed:", err);
      if (!silent) setError(err.message || "Failed to load background POS data");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authConfigured, profile, isDemoMode]);


  // Show the last successful POS data immediately, then refresh it from the
  // server in the background. This keeps the POS responsive on slow networks.
  useEffect(() => {
    const businessId = profile?.business_id;
    // Skip cache hydration in demo mode — IDs are not real UUIDs
    if (!activeLocationId || !businessId || isDemoMode) return;
    const cacheBusinessId: string = businessId;
    let active = true;

    async function hydrateFromCache() {
      try {
        const [cachedProducts, cachedCustomers, cachedSettings] = await Promise.all([
          db.cached_products.where('business_id').equals(cacheBusinessId).toArray(),
          db.cached_customers.toArray(),
          db.cached_settings.get('shop_settings_' + cacheBusinessId),
        ]);
        if (!active) return;

        if (cachedProducts.length > 0) {
          setProducts(cachedProducts.map((record) => record.data as PosProductRecord));
        }
        if (cachedCustomers.length > 0) {
          setCustomers(cachedCustomers.map((record) => record.data as PosCustomerRecord));
        }
        if (cachedSettings?.data) {
          setSettings(cachedSettings.data as ShopSettingsRecord);
        }
      } catch (error) {
        // Cache access is optional; the normal server load remains the fallback.
        console.warn('Unable to hydrate POS cache:', error);
      }
    }

    void hydrateFromCache();
    return () => { active = false; };
  }, [activeLocationId, profile?.business_id, isDemoMode]);

  // Pre-fetch when location changes or on mount
  useEffect(() => {
    if (activeLocationId && activeLocationId !== lastLocationId) {
      void loadData(activeLocationId);
    }
  }, [activeLocationId, lastLocationId, loadData]);

  const refreshData = async (silent = true) => {
    if (activeLocationId) await loadData(activeLocationId, silent);
  };

  const updateProductStock = (productId: string, newQuantity: number) => {
    setProducts(current => 
      current.map(p => p.id === productId ? { ...p, stock_quantity: newQuantity } : p)
    );
  };

  // Real-time synchronization — disabled in demo mode (no real Supabase IDs)
  useRealtimeSync({
    enabled: authConfigured && !!profile && !!activeLocationId && !isDemoMode,
    onStockChanged: (payload) => {
      // If we have a payload with specific product update, apply it locally
      if (payload?.new && payload.new.product_id && payload.new.location_id === activeLocationId) {
        updateProductStock(payload.new.product_id, payload.new.quantity);
      } else {
        // Fallback to refresh if payload is missing or for other locations
        void refreshData();
      }
    },
    onCustomerChanged: () => {
      void refreshData();
    },
    onProductChanged: () => {
      void refreshData();
    },
    onSettingsChanged: () => {
      void refreshData();
    },
    onLocationChanged: () => {
      void refreshData();
    }
  });

  return (
    <PosDataContext.Provider value={{ 
      products, 
      customers, 
      settings, 
      loading, 
      error, 
      refreshData,
      updateProductStock
    }}>
      {children}
    </PosDataContext.Provider>
  );
};

export const usePosData = () => {
  const context = useContext(PosDataContext);
  if (!context) throw new Error("usePosData must be used within PosDataProvider");
  return context;
};
