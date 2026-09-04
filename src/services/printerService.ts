import { supabase } from "../lib/supabase";

export type KitchenPrinterConfig = {
  enabled: boolean;
  auto_print: boolean;
  paper_width: "80mm" | "58mm";
  printer_name: string;
  categories: string[];
};

export type BarPrinterConfig = {
  enabled: boolean;
  auto_print: boolean;
  print_mode: "full" | "drinks_only"; // "full": combined receipt; "drinks_only": bar drinks preparation ticket
  paper_width: "80mm" | "58mm";
  printer_name: string;
  categories: string[];
};

export type HospitalityPrinterSettings = {
  kitchen: KitchenPrinterConfig;
  bar: BarPrinterConfig;
};

export const DEFAULT_FOOD_CATEGORIES = [
  "Food",
  "Kitchen",
  "Snacks",
  "Meals",
  "Dishes",
  "Grill",
  "Brochettes",
  "Breakfast",
  "Lunch",
  "Dinner",
  "Dessert",
  "Appetizer",
];

export const DEFAULT_DRINK_CATEGORIES = [
  "Drinks",
  "Beverages",
  "Beer",
  "Wine",
  "Liquor",
  "Spirits",
  "Whisky",
  "Vodka",
  "Cocktails",
  "Soft Drinks",
  "Water",
  "Juice",
  "Coffee",
  "Tea",
  "Cider",
];

export const DEFAULT_PRINTER_SETTINGS: HospitalityPrinterSettings = {
  kitchen: {
    enabled: true,
    auto_print: true,
    paper_width: "80mm",
    printer_name: "Kitchen Food Printer",
    categories: DEFAULT_FOOD_CATEGORIES,
  },
  bar: {
    enabled: true,
    auto_print: false,
    print_mode: "full",
    paper_width: "80mm",
    printer_name: "Main Bar Printer",
    categories: DEFAULT_DRINK_CATEGORIES,
  },
};

const STORAGE_PREFIX = "hospitality_printer_settings_";

export const printerService = {
  getSettings(businessId: string): HospitalityPrinterSettings {
    if (!businessId) return DEFAULT_PRINTER_SETTINGS;
    try {
      const local = localStorage.getItem(STORAGE_PREFIX + businessId);
      if (local) {
        const parsed = JSON.parse(local);
        return {
          kitchen: { ...DEFAULT_PRINTER_SETTINGS.kitchen, ...(parsed.kitchen || {}) },
          bar: { ...DEFAULT_PRINTER_SETTINGS.bar, ...(parsed.bar || {}) },
        };
      }
    } catch {}
    return DEFAULT_PRINTER_SETTINGS;
  },

  async loadSettingsAsync(businessId: string): Promise<HospitalityPrinterSettings> {
    const fallback = this.getSettings(businessId);
    if (!businessId) return fallback;

    try {
      const { data, error } = await supabase
        .from("printer_configurations")
        .select("*")
        .eq("business_id", businessId);

      if (!error && data && data.length > 0) {
        const kitchenRow = data.find((p) => p.printer_type === "kitchen");
        const barRow = data.find((p) => p.printer_type === "bar");

        const merged: HospitalityPrinterSettings = {
          kitchen: {
            enabled: kitchenRow ? kitchenRow.is_active : fallback.kitchen.enabled,
            auto_print: (kitchenRow as any)?.auto_print ?? fallback.kitchen.auto_print,
            paper_width: (kitchenRow?.paper_width as any) || fallback.kitchen.paper_width,
            printer_name: kitchenRow?.name || fallback.kitchen.printer_name,
            categories:
              kitchenRow?.target_categories && kitchenRow.target_categories.length > 0
                ? kitchenRow.target_categories
                : fallback.kitchen.categories,
          },
          bar: {
            enabled: barRow ? barRow.is_active : fallback.bar.enabled,
            auto_print: (barRow as any)?.auto_print ?? fallback.bar.auto_print,
            print_mode: (barRow as any)?.print_mode || fallback.bar.print_mode,
            paper_width: (barRow?.paper_width as any) || fallback.bar.paper_width,
            printer_name: barRow?.name || fallback.bar.printer_name,
            categories:
              barRow?.target_categories && barRow.target_categories.length > 0
                ? barRow.target_categories
                : fallback.bar.categories,
          },
        };

        this.saveToStorage(businessId, merged);
        return merged;
      }
    } catch (e) {
      console.warn("Failed to fetch cloud printer settings, using local:", e);
    }

    return fallback;
  },

  saveToStorage(businessId: string, settings: HospitalityPrinterSettings) {
    if (!businessId) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + businessId, JSON.stringify(settings));
    } catch {}
  },

  async saveSettings(businessId: string, settings: HospitalityPrinterSettings): Promise<void> {
    this.saveToStorage(businessId, settings);

    if (!businessId) return;

    try {
      // Upsert kitchen printer record
      await supabase.from("printer_configurations").upsert(
        [
          {
            business_id: businessId,
            name: settings.kitchen.printer_name || "Kitchen Food Printer",
            printer_type: "kitchen",
            is_active: settings.kitchen.enabled,
            paper_width: settings.kitchen.paper_width,
            target_categories: settings.kitchen.categories,
            auto_print: settings.kitchen.auto_print,
          },
          {
            business_id: businessId,
            name: settings.bar.printer_name || "Main Bar Printer",
            printer_type: "bar",
            is_active: settings.bar.enabled,
            paper_width: settings.bar.paper_width,
            target_categories: settings.bar.categories,
            auto_print: settings.bar.auto_print,
            print_mode: settings.bar.print_mode,
          },
        ],
        { onConflict: "business_id, printer_type" }
      );
    } catch (e) {
      console.warn("Could not sync printer configs to database:", e);
    }
  },

  isFoodItem(
    item: { name: string; category_name?: string | null },
    config: KitchenPrinterConfig
  ): boolean {
    const cat = (item.category_name || "").toLowerCase().trim();
    const name = item.name.toLowerCase().trim();

    if (config.categories.some((c) => c.toLowerCase().trim() === cat)) return true;

    const foodKeywords = [
      "food",
      "kitchen",
      "burger",
      "pizza",
      "steak",
      "chicken",
      "fish",
      "meat",
      "snack",
      "meal",
      "dish",
      "grill",
      "fries",
      "chips",
      "soup",
      "salad",
      "rice",
      "pasta",
      "brochette",
      "sandwich",
      "dessert",
      "breakfast",
      "lunch",
      "dinner",
      "pork",
      "beef",
      "goat",
      "omelet",
      "egg",
    ];
    return foodKeywords.some((k) => cat.includes(k) || name.includes(k));
  },

  isDrinkItem(
    item: { name: string; category_name?: string | null },
    config: BarPrinterConfig
  ): boolean {
    const cat = (item.category_name || "").toLowerCase().trim();
    const name = item.name.toLowerCase().trim();

    if (config.categories.some((c) => c.toLowerCase().trim() === cat)) return true;

    const drinkKeywords = [
      "drink",
      "beverage",
      "beer",
      "wine",
      "liquor",
      "spirit",
      "whisky",
      "whiskey",
      "vodka",
      "cocktail",
      "gin",
      "rum",
      "tequila",
      "soda",
      "water",
      "juice",
      "coffee",
      "tea",
      "cider",
      "tonic",
      "red bull",
      "skol",
      "mutzig",
      "primus",
      "amstel",
      "heineken",
    ];
    return drinkKeywords.some((k) => cat.includes(k) || name.includes(k));
  },
};
