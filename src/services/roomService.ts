import { supabase } from "../lib/supabase";
import type { RoomRecord, RoomBookingRecord, RoomChargeRecord, RoomStatus, BookingStatus, PaymentStatus } from "../types/database";

function withFolioTotals(booking: any): RoomBookingRecord {
  const totalCharges = (booking.charges || []).reduce((acc: number, charge: any) => acc + Number(charge.amount || 0), 0);
  const totalPayments = (booking.payments || []).reduce((acc: number, payment: any) => acc + Number(payment.amount || 0), 0);
  const totalCost = Number(booking.room_rate || 0) + totalCharges;
  return {
    ...booking,
    total_charges: totalCharges,
    total_payments: totalPayments,
    balance_remaining: Math.max(0, totalCost - Number(booking.advance_paid || 0) - totalPayments),
  } as RoomBookingRecord;
}

const FOLIO_SELECT = `
  *,
  room:rooms(room_number, room_type, price_per_night),
  charges:room_charges(id, service_type, description, amount, quantity, created_at, created_by, users:created_by(full_name)),
  payments:room_payments(id, amount, payment_method, received_by, received_at, users:received_by(full_name))
`;

export const roomService = {
  // --- Rooms Management ---
  async listRooms(businessId: string): Promise<RoomRecord[]> {
    const { data, error } = await supabase
      .from("rooms")
      .select(`
        *,
        active_booking:room_bookings(
          id, guest_name, guest_phone, check_in, expected_checkout, status, room_rate, advance_paid, payment_status
        )
      `)
      .eq("business_id", businessId)
      .order("room_number", { ascending: true });

    if (error) {
      console.warn("Failed to fetch rooms from Supabase, returning mock/empty data:", error);
      return [];
    }

    return (data || []).map((r: any) => ({
      ...r,
      active_booking: Array.isArray(r.active_booking) 
        ? r.active_booking.find((b: any) => b.status === "checked_in" || b.status === "reserved") || null
        : r.active_booking
    }));
  },

  async createRoom(room: {
    business_id: string;
    room_number: string;
    room_type: string;
    price_per_night: number;
    capacity?: number;
    floor?: string;
    notes?: string;
  }): Promise<RoomRecord> {
    const { data, error } = await supabase
      .from("rooms")
      .insert([
        {
          business_id: room.business_id,
          room_number: room.room_number,
          room_type: room.room_type,
          price_per_night: room.price_per_night,
          capacity: room.capacity || 2,
          floor: room.floor || "Floor 1",
          notes: room.notes || null,
          status: "available",
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateRoom(roomId: string, updates: Partial<RoomRecord>): Promise<RoomRecord> {
    const { data, error } = await supabase
      .from("rooms")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", roomId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateRoomStatus(roomId: string, status: RoomStatus): Promise<void> {
    const { error } = await supabase
      .from("rooms")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", roomId);

    if (error) throw error;
  },

  async deleteRoom(roomId: string): Promise<void> {
    const { error } = await supabase.from("rooms").delete().eq("id", roomId);
    if (error) throw error;
  },

  // --- Bookings & Reception ---
  async listActiveBookings(businessId: string): Promise<RoomBookingRecord[]> {
    const { data, error } = await supabase
      .from("room_bookings")
      .select(FOLIO_SELECT)
      .eq("business_id", businessId)
      .in("status", ["checked_in", "reserved"])
      .order("check_in", { ascending: false });

    if (error) {
      console.warn("Failed to fetch bookings:", error);
      return [];
    }

    return (data || []).map(withFolioTotals);
  },

  async listBookingHistory(businessId: string, limit = 100): Promise<RoomBookingRecord[]> {
    const { data, error } = await supabase
      .from("room_bookings")
      .select(FOLIO_SELECT)
      .eq("business_id", businessId)
      .order("check_in", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).map(withFolioTotals);
  },

  async checkInGuest(booking: {
    business_id: string;
    room_id: string;
    guest_name: string;
    guest_phone?: string;
    guest_nationality?: string;
    guest_id_passport?: string;
    number_of_guests?: number;
    expected_checkout?: string;
    room_rate: number;
    advance_paid?: number;
    payment_status?: PaymentStatus;
    notes?: string;
    created_by?: string;
  }): Promise<RoomBookingRecord> {
    // 1. Create booking
    const { data, error } = await supabase
      .from("room_bookings")
      .insert([
        {
          business_id: booking.business_id,
          room_id: booking.room_id,
          guest_name: booking.guest_name,
          guest_phone: booking.guest_phone || null,
          guest_nationality: booking.guest_nationality || "Rwandan",
          guest_id_passport: booking.guest_id_passport || null,
          number_of_guests: booking.number_of_guests || 1,
          check_in: new Date().toISOString(),
          expected_checkout: booking.expected_checkout || null,
          status: "checked_in",
          room_rate: booking.room_rate,
          advance_paid: booking.advance_paid || 0,
          payment_status: booking.payment_status || (booking.advance_paid && booking.advance_paid >= booking.room_rate ? "paid" : "unpaid"),
          notes: booking.notes || null,
          created_by: booking.created_by || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // 2. Mark room as occupied
    await supabase
      .from("rooms")
      .update({ status: "occupied", updated_at: new Date().toISOString() })
      .eq("id", booking.room_id);

    return data;
  },

  async postChargeToRoom(charge: {
    business_id: string;
    booking_id: string;
    sale_id?: string;
    service_type: "bar" | "food" | "laundry" | "room_service" | "other";
    description: string;
    amount: number;
    quantity?: number;
    created_by?: string;
  }): Promise<RoomChargeRecord> {
    const { data, error } = await supabase
      .from("room_charges")
      .insert([
        {
          business_id: charge.business_id,
          booking_id: charge.booking_id,
          sale_id: charge.sale_id || null,
          service_type: charge.service_type,
          description: charge.description,
          amount: charge.amount,
          quantity: charge.quantity || 1,
          created_by: charge.created_by || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async checkoutBooking(bookingId: string, roomId: string, finalPaymentAmount: number, paymentMethod: 'cash' | 'momo' | 'card' | 'bank', receivedBy?: string): Promise<void> {
    if (finalPaymentAmount < 0) throw new Error("Payment cannot be negative");
    if (finalPaymentAmount > 0) {
      const { error: paymentError } = await supabase.from("room_payments").insert({
        booking_id: bookingId,
        amount: finalPaymentAmount,
        payment_method: paymentMethod,
        received_by: receivedBy || null,
      });
      if (paymentError) throw paymentError;
    }
    // 1. Mark booking as checked_out
    const { error: bookingErr } = await supabase
      .from("room_bookings")
      .update({
        status: "checked_out",
        check_out: new Date().toISOString(),
        payment_status: "paid",
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (bookingErr) throw bookingErr;

    // 2. Mark room as cleaning so housekeeping knows to prepare it
    await supabase
      .from("rooms")
      .update({ status: "cleaning", updated_at: new Date().toISOString() })
      .eq("id", roomId);
  },

  async getRoomDashboardKPIs(businessId: string) {
    const rooms = await this.listRooms(businessId);
    const bookings = await this.listActiveBookings(businessId);

    const totalRooms = rooms.length;
    const availableRooms = rooms.filter((r) => r.status === "available").length;
    const occupiedRooms = rooms.filter((r) => r.status === "occupied").length;
    const reservedRooms = rooms.filter((r) => r.status === "reserved").length;
    const cleaningRooms = rooms.filter((r) => r.status === "cleaning").length;

    const pendingRoomPayments = bookings.reduce((acc, b) => acc + (b.balance_remaining || 0), 0);

    return {
      totalRooms,
      availableRooms,
      occupiedRooms,
      reservedRooms,
      cleaningRooms,
      pendingRoomPayments,
      activeBookingsCount: bookings.length,
    };
  },
};
