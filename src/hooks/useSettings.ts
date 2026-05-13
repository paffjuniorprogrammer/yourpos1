import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getShopSettingsRecord } from '../services/settingsService';
import type { ShopSettingsRecord } from '../types/database';

export function useSettings() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<ShopSettingsRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      if (!profile?.business_id) {
        setLoading(false);
        return;
      }

      try {
        const record = await getShopSettingsRecord(profile.business_id);
        setSettings(record);
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [profile?.business_id]);

  return {
    settings,
    loading,
    refresh: async () => {
      if (!profile?.business_id) {
        return;
      }
      setLoading(true);
      const record = await getShopSettingsRecord(profile.business_id);
      setSettings(record);
      setLoading(false);
    },
  };
}
