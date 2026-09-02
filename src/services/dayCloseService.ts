import { supabase } from "../lib/supabase";
import type { HospitalityDayClosureRecord } from "../types/database";

export const dayCloseService = {
  async getOpenRegister(businessId: string) {
    const { data, error } = await supabase
      .from("day_closures")
      .select("*")
      .eq("business_id", businessId)
      .eq("status", "open")
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as any | null;
  },

  async openRegister(input: { business_id: string; user_id: string; location_id?: string | null; opening_cash: number }) {
    const existing = await this.getOpenRegister(input.business_id);
    if (existing) return existing;
    const now = new Date().toISOString();
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali" }).format(new Date());
    const payload = {
      business_id: input.business_id,
      user_id: input.user_id,
      location_id: input.location_id || null,
      closing_date: localDate,
      closure_date: localDate,
      opened_at: now,
      opening_cash: Number(input.opening_cash || 0),
      cash_amount: 0, momo_amount: 0, bank_amount: 0, card_amount: 0, credit_amount: 0, total_amount: 0,
      total_sales: 0, cash_received: 0, momo_received: 0, card_received: 0,
      room_revenue: 0, total_expenses: 0, net_profit: 0,
      status: "open", closed_at: null,
    };
    const { data, error } = await supabase.from("day_closures").insert(payload).select().single();
    if (error) throw error;
    return data as any;
  },

  async getDailySummary(businessId: string, dateStr?: string) {
    const targetDate = dateStr || new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali" }).format(new Date());
    // Bar operations are settled by Rwanda's local calendar day, not UTC.
    const startIso = new Date(`${targetDate}T00:00:00+02:00`).toISOString();
    const endIso = new Date(`${targetDate}T23:59:59.999+02:00`).toISOString();

    console.log(`\n📊 ================== BAR & KITCHEN CLOSE DAY REPORT ==================`);
    console.log(`📅 Date: ${targetDate}`);
    console.log(`🏢 Business: ${businessId}`);
    console.log(`⏰ Time Range: ${startIso} to ${endIso}`);

    try {
      // 1. Fetch ALL sales (no filter - do it in JavaScript to avoid query errors)
      const { data: allSales, error: salesError } = await supabase
        .from("sales")
        .select("id, total_amount, payment_method, payment_status, created_at, notes")
        .eq("business_id", businessId)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: false });

      if (salesError) {
        console.error("❌ Database error fetching sales:", salesError);
        throw salesError;
      }

      // LOG ALL RAW DATA
      console.log(`\n🔍 RAW QUERY RESULT: ${(allSales || []).length} records returned`);
      if (allSales && allSales.length > 0) {
        console.log("📋 Raw Sales Data:");
        allSales.forEach((s, i) => {
          console.log(`  [${i}] id=${s.id}, payment_status=${s.payment_status}, method=${s.payment_method}, amount=${s.total_amount}, time=${s.created_at}`);
        });
      } else {
        console.warn("⚠️ NO SALES FOUND IN DATABASE for this date/business!");
        console.log(`   - Business ID: ${businessId}`);
        console.log(`   - Date Range: ${startIso} to ${endIso}`);
      }

      console.log(`✅ Fetched ${allSales?.length || 0} total sales from database`);

      // Filter for ONLY Bar & Kitchen (cash, momo, card) - NOT room_folio
      const validSales = (allSales || []).filter((s) => {
        const isBarPayment = ["cash", "momo", "card", "bank"].includes(s.payment_method || "");
        const isValid = isBarPayment && s.payment_status === "paid";
        if (!isValid && s) {
          console.log(`   ⏭️  Skipping: method=${s.payment_method}, payment_status=${s.payment_status}`);
        }
        return isValid;
      });

      console.log(`✅ Found ${validSales.length} valid Bar & Kitchen sales`);
      
      if (validSales.length > 0) {
        console.log(`\n📝 Sales Details:`);
        validSales.forEach((s, idx) => {
          console.log(`  ${idx + 1}. ${(s.payment_method || "").toUpperCase()}: ${s.total_amount} RWF | ${s.notes || "N/A"} | ${s.created_at}`);
        });
      }

      // Calculate totals by payment method (ONLY bar & kitchen)
      const totalSales = validSales.reduce((acc, s) => acc + Number(s.total_amount || 0), 0);
      
      let cashReceived = 0;
      let momoReceived = 0;
      let cardReceived = 0;

      // Breakdown by payment method
      validSales.forEach((s) => {
        const amt = Number(s.total_amount || 0);
        if (s.payment_method === "cash") {
          cashReceived += amt;
        } else if (s.payment_method === "momo") {
          momoReceived += amt;
        } else if (s.payment_method === "card") {
          cardReceived += amt;
        }
      });

      // Try to fetch expenses - but if table doesn't exist, just use 0
      let totalExpenses = 0;
      try {
        const { data: expenses } = await supabase
          .from("stock_loss_expenses")
          .select("id, total_cost, created_at")
          .eq("business_id", businessId)
          .gte("created_at", startIso)
          .lte("created_at", endIso);

        totalExpenses = (expenses || []).reduce((acc, e) => acc + Number(e.total_cost || 0), 0);
      } catch (expErr) {
        console.warn("⚠️ Stock loss expenses table not available:", expErr);
        totalExpenses = 0;
      }

      const netProfit = totalSales - totalExpenses;

      const summary = {
        date: targetDate,
        totalSales,
        cashReceived,
        momoReceived,
        cardReceived,
        roomFolioCharges: 0, // NOT COUNTED - room charges are separate
        roomRevenue: 0, // Room accommodation managed by separate system
        totalExpenses,
        netProfit,
        salesCount: validSales.length,
        expenseCount: 0,
      };

      console.log(`\n💰 PAYMENT BREAKDOWN:`);
      console.log(`   💵 Cash:       ${cashReceived} RWF`);
      console.log(`   📱 MoMo:       ${momoReceived} RWF`);
      console.log(`   💳 Card:       ${cardReceived} RWF`);
      console.log(`   ─────────────────────`);
      console.log(`   📊 Total:      ${totalSales} RWF`);
      console.log(`\n💸 EXPENSES:    ${totalExpenses} RWF`);
      console.log(`💹 NET PROFIT:  ${netProfit} RWF`);
      console.log(`📄 Transactions: ${validSales.length}`);
      console.log(`═══════════════════════════════════════════════════════════════\n`);

      return summary;
    } catch (err) {
      console.error("❌ Critical error in getDailySummary:", err);
      // Return empty summary on error
      return {
        date: targetDate,
        totalSales: 0,
        cashReceived: 0,
        momoReceived: 0,
        cardReceived: 0,
        roomFolioCharges: 0,
        roomRevenue: 0,
        totalExpenses: 0,
        netProfit: 0,
        salesCount: 0,
        expenseCount: 0,
      };
    }
  },

  async saveClosure(closure: {
    business_id: string;
    closure_date: string;
    register_id?: string | null;
    user_id?: string;
    location_id?: string | null;
    closed_by?: string;
    total_sales: number;
    cash_received: number;
    momo_received: number;
    card_received: number;
    room_revenue: number;
    total_expenses: number;
    net_profit: number;
    notes?: string;
  }): Promise<HospitalityDayClosureRecord> {
    console.log("\n💾 Saving Day Closure Record...");
    console.log(`   Date: ${closure.closure_date}`);
    console.log(`   Total Sales: ${closure.total_sales} RWF`);
    console.log(`   Notes: ${closure.notes || "None"}`);
    
    try {
      const payload = {
        ...closure,
        closing_date: closure.closure_date,
        user_id: closure.user_id,
        cash_amount: closure.cash_received,
        momo_amount: closure.momo_received,
        card_amount: closure.card_received,
        total_amount: closure.total_sales,
        status: "closed",
        closed_at: new Date().toISOString(),
      };
      delete (payload as any).register_id;
      const query = supabase.from("day_closures");
      const { data, error } = closure.register_id
        ? await query.update(payload).eq("id", closure.register_id).eq("status", "open").select().single()
        : await query.insert([payload]).select().single();

      if (error) {
        console.error("❌ Error saving closure:", error);
        throw error;
      }
      
      console.log("✅ Day Closure Saved Successfully!\n");
      return data;
    } catch (err) {
      console.error("❌ Failed to save closure:", err);
      throw err;
    }
  },

  async listClosures(businessId: string): Promise<HospitalityDayClosureRecord[]> {
    try {
      const { data, error } = await supabase
        .from("day_closures")
        .select("*")
        .eq("business_id", businessId)
        .order("closure_date", { ascending: false });

      if (error) {
        console.warn("⚠️ Failed to fetch day closures:", error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.warn("⚠️ Error listing closures:", err);
      return [];
    }
  },
};
