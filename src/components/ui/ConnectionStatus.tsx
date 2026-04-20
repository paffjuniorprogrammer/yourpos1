import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { db } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks'; // We can use this to listen to pending sales count

export function ConnectionStatus() {
  const { isOnline, isSyncing } = useOfflineSync();
  const pendingCount = useLiveQuery(() => db.pending_sales.count(), []) ?? 0;

  if (isOnline && pendingCount === 0 && !isSyncing) {
     return null; // Minimal: completely hide it if normal
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full px-4 py-2.5 text-xs font-bold shadow-xl transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 ${
      !isOnline 
        ? 'bg-rose-50 text-rose-700 border border-rose-200' 
        : isSyncing || pendingCount > 0
          ? 'bg-amber-50 text-amber-700 border border-amber-200'
          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    }`}>
      {!isOnline ? (
        <>
           <WifiOff size={16} className="animate-pulse" />
           <span>Offline Mode — Data safely queued</span>
           {pendingCount > 0 && <span className="rounded-full bg-rose-200 px-2 py-0.5 ml-2 text-rose-800">{pendingCount}</span>}
        </>
      ) : isSyncing || pendingCount > 0 ? (
        <>
           <Loader2 size={16} className="animate-spin text-amber-500" />
           <span>Syncing queued sales ({pendingCount} left)...</span>
        </>
      ) : (
        <>
           <Wifi size={16} />
           <span>All Systems Synced</span>
        </>
      )}
    </div>
  );
}
