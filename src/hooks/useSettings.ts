import { useState, useEffect } from 'react';
import { getShopSettingsRecord } from '../services/settingsService';
import type { ShopSettingsRecord } from '../types/database';

export function useSettings() {
  const [settings, setSettings] = useState<ShopSettingsRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      try {
        const record = await getShopSettingsRecord();
        setSettings(record);
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  return { settings, loading, refresh: async () => {
    setLoading(true);
    const record = await getShopSettingsRecord();
    setSettings(record);
    setLoading(false);
  }};
}
