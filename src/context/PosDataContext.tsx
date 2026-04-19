import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { listPosProducts, listPosCustomers, getShopSettings } from '../services/posService';
import type { PosProductRecord, PosCustomerRecord, ShopSettingsRecord } from '../types/database';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

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
  const { activeLocationId, authConfigured, profile } = useAuth();
  const [products, setProducts] = useState<PosProductRecord[]>([]);
  const [customers, setCustomers] = useState<PosCustomerRecord[]>([]);
  const [settings, setSettings] = useState<ShopSettingsRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLocationId, setLastLocationId] = useState<string | null>(null);

  const loadData = useCallback(async (locationId: string, silent = false) => {
    if (!authConfigured || !profile) return;
    
    if (!silent) setLoading(true);
    try {
      const [nextProducts, nextCustomers, nextSettings] = await Promise.all([
        listPosProducts(locationId, 1000), // Increase limit for better coverage
        listPosCustomers(),
        getShopSettings()
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
  }, [authConfigured, profile]);

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

  // Real-time synchronization
  useRealtimeSync({
    enabled: authConfigured && !!profile && !!activeLocationId,
    onStockChanged: () => {
      // For stock changes, we trigger a background refresh to ensure accuracy
      void refreshData();
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
