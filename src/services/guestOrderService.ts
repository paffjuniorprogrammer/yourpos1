import { supabase } from "../lib/supabase";

export type GuestMenuProduct = { id: string; name: string; price: number; category: string; image_url?: string | null; in_stock: number };
export type GuestMenu = { business_id: string; business_name: string; target: { kind: "table" | "room"; label: string }; products: GuestMenuProduct[] };
export type GuestOrder = {
  id: string;
  guest_name: string;
  guest_phone?: string | null;
  table_id?: string | null;
  room_id?: string | null;
  table?: { table_number: string } | null;
  room?: { room_number: string } | null;
  items: Array<{ product_id: string; name: string; quantity: number; unit_price?: number; line_total?: number }>;
  total: number;
  created_at: string;
  status: "pending" | "accepted" | "rejected";
};
export type QrMenuControlProduct = { id: string; name: string; category: string; price: number; enabled: boolean };

export const guestOrderService = {
  async getMenu(kind: "table" | "room", token: string): Promise<GuestMenu> {
    const { data, error } = await supabase.rpc("get_guest_qr_menu", { p_kind: kind, p_token: token });
    if (error) throw error;
    return data as GuestMenu;
  },
  async submit(kind: "table" | "room", token: string, guestName: string, guestPhone: string, items: Array<{ product_id: string; quantity: number }>) {
    const { data, error } = await supabase.rpc("submit_guest_qr_order", { p_kind: kind, p_token: token, p_guest_name: guestName, p_guest_phone: guestPhone, p_items: items });
    if (error) throw error;
    return data as string;
  },
  async listPending(businessId: string): Promise<GuestOrder[]> {
    try {
      const { data, error } = await supabase
        .from("guest_orders")
        .select(`
          *,
          table:dining_tables(table_number),
          room:rooms(room_number)
        `)
        .eq("business_id", businessId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (!error && data) {
        return data as GuestOrder[];
      }
    } catch (e) {
      console.warn("Joined guest orders fetch failed, trying basic select:", e);
    }

    const { data, error } = await supabase
      .from("guest_orders")
      .select("*")
      .eq("business_id", businessId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []) as GuestOrder[];
  },
  async review(orderId: string, reviewerId: string, accepted: boolean, reason?: string) {
    const { error } = await supabase.rpc("review_guest_qr_order", { p_order_id: orderId, p_reviewer: reviewerId, p_accept: accepted, p_reason: reason || null });
    if (error) throw error;
  },
  async listMenuControls(businessId: string): Promise<QrMenuControlProduct[]> {
    const { data, error } = await supabase.rpc("get_qr_menu_products", { p_business_id: businessId });
    if (error) throw error;
    return (data || []) as QrMenuControlProduct[];
  },
  async setMenuProduct(productId: string, enabled: boolean) {
    const { error } = await supabase.rpc("set_qr_menu_product_enabled", { p_product_id: productId, p_enabled: enabled });
    if (error) throw error;
  },
};
