import { ensureSupabaseConfigured } from "./supabaseUtils";
import type { ShopSettingsRecord } from "../types/database";

export type VatRegistrationStatus = "not_registered" | "registered";
export type VatPriceType = "inclusive" | "exclusive";
export type VatTaxPeriod = "monthly" | "quarterly";
export type VatSourceType = "sale" | "purchase";
export type VatStatus = "VAT Payable" | "VAT Credit" | "VAT Disabled";

export type VatSettings = {
  businessName: string;
  tinNumber: string;
  vatRegistrationNumber: string;
  ebmSerialNumber: string;
  registrationStatus: VatRegistrationStatus;
  vatRate: number;
  priceType: VatPriceType;
  taxPeriod: VatTaxPeriod;
};

export type VatLineCalculation = {
  amountBeforeVat: number;
  vatAmount: number;
  totalAmount: number;
};

export type VatSummary = {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  businessInfo: VatSettings;
  salesBeforeVat: number;
  purchasesBeforeVat: number;
  outputVat: number;
  inputVat: number;
  salesIncludingVat: number;
  purchasesIncludingVat: number;
  vatPayable: number;
  vatCredit: number;
  status: VatStatus;
  disabled: boolean;
};

export type VatHistoryRow = VatSummary & {
  month: string;
};

const DEFAULT_VAT_SETTINGS: VatSettings = {
  businessName: "",
  tinNumber: "",
  vatRegistrationNumber: "",
  ebmSerialNumber: "",
  registrationStatus: "not_registered",
  vatRate: 18,
  priceType: "inclusive",
  taxPeriod: "monthly",
};

export function roundRwf(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0);
}

export function getVatSettings(settings?: Partial<ShopSettingsRecord> | null): VatSettings {
  const rawStatus = (settings as any)?.vat_registration_status;
  const rawPriceType = (settings as any)?.vat_price_type;
  const rawTaxPeriod = (settings as any)?.tax_period;

  return {
    businessName: settings?.shop_name || DEFAULT_VAT_SETTINGS.businessName,
    tinNumber: (settings as any)?.tin_number || "",
    vatRegistrationNumber: (settings as any)?.vat_registration_number || "",
    ebmSerialNumber: (settings as any)?.ebm_serial_number || "",
    registrationStatus: rawStatus === "registered" ? "registered" : "not_registered",
    vatRate: Number(settings?.tax_percentage ?? DEFAULT_VAT_SETTINGS.vatRate) || DEFAULT_VAT_SETTINGS.vatRate,
    priceType: rawPriceType === "exclusive" ? "exclusive" : "inclusive",
    taxPeriod: rawTaxPeriod === "quarterly" ? "quarterly" : "monthly",
  };
}

export function isVatEnabled(settings?: Partial<ShopSettingsRecord> | null) {
  return getVatSettings(settings).registrationStatus === "registered";
}

export function calculateVatLine(input: {
  amount: number;
  vatRate: number;
  priceType: VatPriceType;
  vatEnabled: boolean;
  supplierVatRegistered?: boolean;
}): VatLineCalculation {
  const amount = Math.max(0, Number(input.amount || 0));
  const rate = Math.max(0, Number(input.vatRate || 0));
  const canApplyVat = input.vatEnabled && rate > 0 && input.supplierVatRegistered !== false;

  if (!canApplyVat) {
    return {
      amountBeforeVat: roundRwf(amount),
      vatAmount: 0,
      totalAmount: roundRwf(amount),
    };
  }

  if (input.priceType === "exclusive") {
    const vatAmount = roundRwf(amount * (rate / 100));
    return {
      amountBeforeVat: roundRwf(amount),
      vatAmount,
      totalAmount: roundRwf(amount + vatAmount),
    };
  }

  const amountBeforeVat = roundRwf(amount / (1 + rate / 100));
  const totalAmount = roundRwf(amount);
  return {
    amountBeforeVat,
    vatAmount: Math.max(0, totalAmount - amountBeforeVat),
    totalAmount,
  };
}

export function getCurrentVatPeriod(date = new Date(), taxPeriod: VatTaxPeriod = "monthly") {
  const year = date.getFullYear();
  const month = date.getMonth();

  if (taxPeriod === "quarterly") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    const start = new Date(year, quarterStartMonth, 1);
    const end = new Date(year, quarterStartMonth + 3, 0, 23, 59, 59, 999);
    const quarter = Math.floor(month / 3) + 1;
    return {
      start,
      end,
      label: `Q${quarter} ${year}`,
      key: `${year}-Q${quarter}`,
    };
  }

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return {
    start,
    end,
    label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
  };
}

function toIsoStart(date: Date) {
  return `${date.toISOString().split("T")[0]}T00:00:00.000Z`;
}

function toIsoEnd(date: Date) {
  return `${date.toISOString().split("T")[0]}T23:59:59.999Z`;
}

function calculateVatPosition(outputVat: number, inputVat: number) {
  const net = roundRwf(outputVat - inputVat);
  return {
    vatPayable: Math.max(0, net),
    vatCredit: Math.max(0, -net),
    status: net > 0 ? "VAT Payable" as VatStatus : net < 0 ? "VAT Credit" as VatStatus : "VAT Payable" as VatStatus,
  };
}

export async function getVatSummary(targetDate = new Date()): Promise<VatSummary> {
  if (localStorage.getItem("is_demo_mode") === "true") {
    const period = getCurrentVatPeriod(targetDate, "monthly");
    return {
      periodLabel: period.label,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      businessInfo: {
        businessName: "Kigali Fresh Market (Demo)",
        registrationStatus: "registered",
        taxPeriod: "monthly",
        tinNumber: "109876543",
        vatRegistrationNumber: "VAT-109876543",
        ebmSerialNumber: "EBM-00123",
        vatRate: 18,
        priceType: "inclusive"
      },
      salesBeforeVat: 4110169,
      purchasesBeforeVat: 2118644,
      outputVat: 739831,
      inputVat: 381356,
      salesIncludingVat: 4850000,
      purchasesIncludingVat: 2500000,
      vatPayable: 358475,
      vatCredit: 0,
      status: "VAT Payable",
      disabled: false,
    };
  }
  const client = await ensureSupabaseConfigured();
  const { data: settings } = await client.from("shop_settings").select("*").maybeSingle();
  const businessInfo = getVatSettings(settings as any);
  const period = getCurrentVatPeriod(targetDate, businessInfo.taxPeriod);
  const disabled = businessInfo.registrationStatus !== "registered";

  if (disabled) {
    return {
      periodLabel: period.label,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      businessInfo,
      salesBeforeVat: 0,
      purchasesBeforeVat: 0,
      outputVat: 0,
      inputVat: 0,
      salesIncludingVat: 0,
      purchasesIncludingVat: 0,
      vatPayable: 0,
      vatCredit: 0,
      status: "VAT Disabled",
      disabled,
    };
  }

  const [{ data: sales, error: salesError }, { data: purchases, error: purchasesError }] = await Promise.all([
    client
      .from("sales")
      .select("subtotal,tax_amount,total_amount,amount_before_vat,output_vat")
      .gte("created_at", toIsoStart(period.start))
      .lte("created_at", toIsoEnd(period.end)),
    client
      .from("purchases")
      .select("total_cost,amount_before_vat,input_vat")
      .gte("purchase_date", toIsoStart(period.start))
      .lte("purchase_date", toIsoEnd(period.end)),
  ]);

  if (salesError) throw salesError;
  if (purchasesError) throw purchasesError;

  const salesBeforeVat = roundRwf((sales || []).reduce((sum: number, sale: any) => sum + Number(sale.amount_before_vat ?? sale.subtotal ?? 0), 0));
  const outputVat = roundRwf((sales || []).reduce((sum: number, sale: any) => sum + Number(sale.output_vat ?? sale.tax_amount ?? 0), 0));
  const salesIncludingVat = roundRwf((sales || []).reduce((sum: number, sale: any) => sum + Number(sale.total_amount || 0), 0));
  const purchasesBeforeVat = roundRwf((purchases || []).reduce((sum: number, purchase: any) => sum + Number(purchase.amount_before_vat ?? purchase.total_cost ?? 0), 0));
  const inputVat = roundRwf((purchases || []).reduce((sum: number, purchase: any) => sum + Number(purchase.input_vat || 0), 0));
  const purchasesIncludingVat = roundRwf((purchases || []).reduce((sum: number, purchase: any) => sum + Number(purchase.total_cost || 0), 0));
  const position = calculateVatPosition(outputVat, inputVat);

  return {
    periodLabel: period.label,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    businessInfo,
    salesBeforeVat,
    purchasesBeforeVat,
    outputVat,
    inputVat,
    salesIncludingVat,
    purchasesIncludingVat,
    ...position,
    disabled,
  };
}

export async function getVatHistory(months = 6): Promise<VatHistoryRow[]> {
  const rows: VatHistoryRow[] = [];
  const now = new Date();
  for (let index = 0; index < months; index += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const summary = await getVatSummary(date);
    rows.push({ ...summary, month: summary.periodLabel });
  }
  return rows;
}
