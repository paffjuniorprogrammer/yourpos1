import { db } from '../lib/db';
import { pushSaleToSupabase } from './saleService';
import { pushPosSaleToSupabase, pushRegisterOpenToSupabase, pushDayClosureToSupabase } from './posService';
import { pushCustomerToSupabase } from './customerService';

export async function syncPendingSales() {
  if (!navigator.onLine) {
    return;
  }

  // 1. Process new universal pending_actions table
  const pendingActions = await db.pending_actions.where('status').equals('pending').toArray();
  
  if (pendingActions.length > 0) {
    console.log(`[Offline Sync] Found ${pendingActions.length} pending actions to sync.`);
    for (const record of pendingActions) {
      try {
        switch (record.type) {
          case 'sale':
            if ('payments' in record.payload) {
              await pushPosSaleToSupabase(record.payload);
            } else {
              await pushSaleToSupabase(record.payload);
            }
            break;
          case 'customer':
            await pushCustomerToSupabase(record.payload);
            break;
          case 'register_open':
            await pushRegisterOpenToSupabase(record.payload);
            break;
          case 'register_close':
            await pushDayClosureToSupabase(record.payload);
            break;
        }
        
        await db.pending_actions.delete(record.id);
        console.log(`[Offline Sync] Successfully synced ${record.type} action ${record.id}`);
      } catch (e: any) {
        if (e?.message === 'Failed to fetch' || e?.message?.includes('network')) {
          console.warn(`[Offline Sync] Network dropped during action sync. Halting.`);
          return; 
        }
        console.error(`[Offline Sync] Error syncing ${record.type} action ${record.id}:`, e);
        await db.pending_actions.update(record.id, { error: e.message || 'Unknown error' });
      }
    }
  }

  // 2. Fallback for legacy pending_sales table (for older offline records)
  const legacySales = await db.pending_sales.where('status').equals('pending').toArray();
  
  if (legacySales.length > 0) {
    console.log(`[Offline Sync] Found ${legacySales.length} legacy sales to sync.`);
    for (const record of legacySales) {
      try {
        if ('payments' in record.payload) {
          await pushPosSaleToSupabase(record.payload);
        } else {
          await pushSaleToSupabase(record.payload);
        }
        await db.pending_sales.delete(record.id);
        console.log(`[Offline Sync] Successfully synced legacy sale ${record.id}`);
      } catch (e: any) {
        if (e?.message === 'Failed to fetch' || e?.message?.includes('network')) {
          console.warn(`[Offline Sync] Network dropped during legacy sync. Halting.`);
          return;
        }
        console.error(`[Offline Sync] Error syncing legacy sale ${record.id}:`, e);
        await db.pending_sales.update(record.id, { error: e.message || 'Unknown error' });
      }
    }
  }
}
