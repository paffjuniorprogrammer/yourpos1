import { useState, useEffect } from 'react';
import { syncPendingSales } from '../services/syncService';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      
      // Auto-trigger sync when coming back online
      setIsSyncing(true);
      try {
        await syncPendingSales();
      } finally {
        setIsSyncing(false);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check when app loads online just in case there are pending from a crash
    if (navigator.onLine) {
       handleOnline();
    }

    // PERIODIC SYNC: Check every 5 minutes for pending items if online
    const interval = setInterval(() => {
      if (navigator.onLine && !isSyncing) {
        handleOnline();
      }
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [isSyncing]);

  return { isOnline, isSyncing };
}
