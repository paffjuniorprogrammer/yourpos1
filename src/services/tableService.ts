import { supabase } from "../lib/supabase";
import type { DiningTableRecord, ActiveTabRecord } from "../types/database";

const HELD_TABS_STORAGE_PREFIX = "pos_held_tabs_";

function getLocalHeldTabs(businessId: string): ActiveTabRecord[] {
  try {
    const raw = localStorage.getItem(HELD_TABS_STORAGE_PREFIX + businessId);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("Failed to read local held tabs:", e);
    return [];
  }
}

function setLocalHeldTabs(businessId: string, tabs: ActiveTabRecord[]): void {
  try {
    localStorage.setItem(HELD_TABS_STORAGE_PREFIX + businessId, JSON.stringify(tabs));
  } catch (e) {
    console.warn("Failed to save local held tabs:", e);
  }
}

export const tableService = {
  // --- Tables Management ---
  async listTables(businessId: string): Promise<DiningTableRecord[]> {
    const { data, error } = await supabase
      .from("dining_tables")
      .select("*")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("table_number", { ascending: true });

    if (error) {
      console.warn("Failed to fetch dining tables from Supabase:", error);
      return [];
    }

    return data || [];
  },

  async createTable(table: {
    business_id: string;
    table_number: string;
    capacity?: number;
  }): Promise<DiningTableRecord> {
    const { data, error } = await supabase
      .from("dining_tables")
      .insert([
        {
          business_id: table.business_id,
          table_number: table.table_number,
          capacity: table.capacity || 4,
          status: "available",
          is_active: true,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateTableStatus(tableId: string, status: 'available' | 'occupied' | 'reserved'): Promise<void> {
    const { error } = await supabase
      .from("dining_tables")
      .update({ status })
      .eq("id", tableId);

    if (error) throw error;
  },

  async deleteTable(tableId: string): Promise<void> {
    const { error } = await supabase
      .from("dining_tables")
      .update({ is_active: false })
      .eq("id", tableId);

    if (error) throw error;
  },

  // --- Active Tabs / Hold & Resume Orders (with Offline Resiliency) ---
  async listOpenTabs(businessId: string): Promise<ActiveTabRecord[]> {
    const localTabs = getLocalHeldTabs(businessId);

    try {
      const { data, error } = await supabase
        .from("active_tabs")
        .select(`
          *,
          table:dining_tables(table_number),
          booking:room_bookings(guest_name, room_id, rooms(room_number))
        `)
        .eq("business_id", businessId)
        .eq("status", "open")
        .order("updated_at", { ascending: false });

      if (error) {
        console.warn("Supabase fetch failed, returning local cached tabs:", error);
        return localTabs;
      }

      const remoteTabs = data || [];

      // Merge local tabs that may not have reached remote yet
      const combinedMap = new Map<string, ActiveTabRecord>();
      remoteTabs.forEach((t) => combinedMap.set(t.id, t));
      localTabs.forEach((t) => {
        if (!combinedMap.has(t.id)) {
          combinedMap.set(t.id, t);
        }
      });

      const merged = Array.from(combinedMap.values());
      setLocalHeldTabs(businessId, merged);
      return merged;
    } catch (e) {
      console.warn("Offline or network issue, using local storage held tabs:", e);
      return localTabs;
    }
  },

  async saveOrHoldTab(tab: {
    id?: string;
    business_id: string;
    table_id?: string | null;
    booking_id?: string | null;
    customer_id?: string | null;
    tab_name: string;
    cart_items: any[];
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    created_by?: string;
  }): Promise<ActiveTabRecord> {
    const localId = tab.id || `local-tab-${Date.now()}`;
    const localTabRecord: ActiveTabRecord = {
      id: localId,
      business_id: tab.business_id,
      table_id: tab.table_id || null,
      booking_id: tab.booking_id || null,
      customer_id: tab.customer_id || null,
      tab_name: tab.tab_name,
      cart_items: tab.cart_items,
      subtotal: tab.subtotal,
      tax: tab.tax,
      discount: tab.discount,
      total: tab.total,
      status: "open",
      created_by: tab.created_by || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 1. Immediately save to LocalStorage so wifi/power loss never loses it
    const localList = getLocalHeldTabs(tab.business_id);
    const existingIndex = localList.findIndex((t) => t.id === localId);
    if (existingIndex >= 0) {
      localList[existingIndex] = localTabRecord;
    } else {
      localList.unshift(localTabRecord);
    }
    setLocalHeldTabs(tab.business_id, localList);

    // 2. Sync to Supabase
    try {
      if (tab.id && !tab.id.startsWith("local-tab-")) {
        const { data, error } = await supabase
          .from("active_tabs")
          .update({
            table_id: tab.table_id || null,
            booking_id: tab.booking_id || null,
            customer_id: tab.customer_id || null,
            tab_name: tab.tab_name,
            cart_items: tab.cart_items,
            subtotal: tab.subtotal,
            tax: tab.tax,
            discount: tab.discount,
            total: tab.total,
            status: "open",
            updated_at: new Date().toISOString(),
          })
          .eq("id", tab.id)
          .select()
          .single();

        if (!error && data) return data;
      } else {
        const { data, error } = await supabase
          .from("active_tabs")
          .insert([
            {
              business_id: tab.business_id,
              table_id: tab.table_id || null,
              booking_id: tab.booking_id || null,
              customer_id: tab.customer_id || null,
              tab_name: tab.tab_name,
              cart_items: tab.cart_items,
              subtotal: tab.subtotal,
              tax: tab.tax,
              discount: tab.discount,
              total: tab.total,
              status: "open",
              created_by: tab.created_by,
            },
          ])
          .select()
          .single();

        if (!error && data) {
          // Replace local id with server id
          const updatedLocal = localList.map((t) => (t.id === localId ? data : t));
          setLocalHeldTabs(tab.business_id, updatedLocal);
          return data;
        }
      }
    } catch (e) {
      console.warn("Saved tab locally (offline fallback enabled):", e);
    }

    return localTabRecord;
  },

  async closeTab(tabId: string, tableId?: string | null): Promise<void> {
    // 1. Remove/close from local storage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(HELD_TABS_STORAGE_PREFIX)) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const list: ActiveTabRecord[] = JSON.parse(raw);
            const filtered = list.filter((t) => t.id !== tabId);
            localStorage.setItem(key, JSON.stringify(filtered));
          }
        }
      }
    } catch (e) {
      console.warn("Failed to remove tab from local storage:", e);
    }

    // 2. Sync to Supabase
    try {
      if (!tabId.startsWith("local-tab-")) {
        const { error } = await supabase
          .from("active_tabs")
          .update({
            status: "closed",
          })
          .eq("id", tabId);
        // active_tabs has no closed_at column. Including it made the update
        // fail silently, so sold tabs returned after a refresh.
        if (error) throw error;
      }

      if (tableId) {
        await this.updateTableStatus(tableId, "available");
      }
    } catch (e) {
      console.warn("Failed to close tab on Supabase:", e);
    }
  },
};
