import { useEffect, useMemo, useState } from "react";
import type { AppRole, LocationRecord } from "../types/database";
import { Trash2, Building2, Pencil, Plus, Search, ShieldCheck, WalletCards, X, MapPin, Edit, Code2, Key, Globe, Printer, Utensils, Wine, CheckCircle2, Sliders } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import {
  getShopSettingsRecord,
  listStaffAccounts,
  createStaffAccount,
  updateUserProfile,
  upsertUserPermissions,
  deleteUserProfile,
  upsertShopSettings,
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  upsertUserLocations,
  resetStaffPassword,
  updateUserLanguage,
} from "../services/settingsService";
import { listApiKeys, generateApiKey, revokeApiKey, type ApiKeyRecord } from "../services/apiService";
import { UserPermissionRecord } from "../types/database";
import { getFinanceOverview, type FinanceOverview } from "../services/dashboardService";
import { SectionCard } from "../components/ui/SectionCard";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { formatCurrency } from "../lib/format";
import { printerService, type HospitalityPrinterSettings, DEFAULT_PRINTER_SETTINGS } from "../services/printerService";
import { KitchenOrderTicket } from "../components/print/KitchenOrderTicket";
import { BarReceipt } from "../components/print/BarReceipt";

type StaffPermission = {
  module: string;
  view: boolean;
  add: boolean;
  edit: boolean;
  remove: boolean;
};

type StaffAccount = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: AppRole;
  locationId: string | null;
  assignedLocationIds: string[];
  permissions: StaffPermission[];
  auth_user_id?: string | null;
};

type StaffForm = {
  fullName: string;
  email: string;
  phone: string;
  role: AppRole;
  password: string;
  locationId: string | null;
  assignedLocationIds: string[];
  permissions: StaffPermission[];
};

type BusinessSettings = {
  name: string;
  address: string;
  contact: string;
  logoUrl: string;
  defaultProfitPercentage: string;
  taxPercentage: string;
  tinNumber: string;
  vatRegistrationNumber: string;
  ebmSerialNumber: string;
  vatRegistrationStatus: "not_registered" | "registered";
  vatPriceType: "inclusive" | "exclusive";
  taxPeriod: "monthly" | "quarterly";
};

type SettingsSection = "staff" | "business" | "tax" | "finance" | "locations" | "api" | "preferences" | "printers";

const moduleTemplates = [
  { module: "Dashboard", view: true, add: false, edit: false, remove: false },
  { module: "POS", view: true, add: true, edit: false, remove: false },
  { module: "Products", view: true, add: true, edit: true, remove: false },
  { module: "Sales", view: true, add: false, edit: false, remove: false },
  { module: "Stock", view: false, add: false, edit: false, remove: false },
  { module: "Transfers", view: false, add: false, edit: false, remove: false },
  { module: "Stock Loss", view: false, add: false, edit: false, remove: false },
  { module: "Bar POS", view: false, add: false, edit: false, remove: false },
  { module: "Rooms", view: false, add: false, edit: false, remove: false },
  { module: "Tables", view: false, add: false, edit: false, remove: false },
  { module: "Customers", view: true, add: true, edit: false, remove: false },
  { module: "Reports", view: false, add: false, edit: false, remove: false },
  { module: "Purchases", view: false, add: false, edit: false, remove: false },
  { module: "Suppliers", view: true, add: true, edit: false, remove: false },
  { module: "Requisitions", view: false, add: false, edit: false, remove: false },
] as StaffPermission[];

function buildStaffPermissions(existing?: StaffPermission[]) {
  const existingMap = new Map(
    existing?.map((permission) => [permission.module.toLowerCase(), permission]) ?? []
  );
  return moduleTemplates.map((template) => {
    const matched = existingMap.get(template.module.toLowerCase());
    return {
      ...template,
      ...(matched ?? {}),
    };
  });
}

const initialBusinessSettings: BusinessSettings = {
  name: "",
  address: "",
  contact: "",
  logoUrl: "",
  defaultProfitPercentage: "",
  taxPercentage: "18",
  tinNumber: "",
  vatRegistrationNumber: "",
  ebmSerialNumber: "",
  vatRegistrationStatus: "not_registered",
  vatPriceType: "inclusive",
  taxPeriod: "monthly",
};

const initialStaffForm: StaffForm = {
  fullName: "",
  email: "",
  phone: "",
  role: "cashier",
  password: "",
  locationId: null,
  assignedLocationIds: [],
  permissions: buildStaffPermissions(),
};

const financeCards = [
  { title: "Sales Today", value: "$2,480.00", tone: "bg-sky-50 text-sky-700" },
  { title: "Sales This Month", value: "$38,200.00", tone: "bg-emerald-50 text-emerald-700" },
  { title: "Sales This Year", value: "$204,600.00", tone: "bg-indigo-50 text-indigo-700" },
  { title: "Purchases Used", value: "$11,850.00", tone: "bg-amber-50 text-amber-700" },
  { title: "Supplier Due Amount", value: "$2,740.00", tone: "bg-rose-50 text-rose-700" },
  { title: "All Paid To Suppliers", value: "$9,110.00", tone: "bg-emerald-50 text-emerald-700" },
  { title: "Customer Unpaid Amount", value: "$1,540.00", tone: "bg-orange-50 text-orange-700" },
  { title: "Tax To Be Paid", value: "$446.40", tone: "bg-brand-50 text-brand-700" },
];

export function SettingsPage() {
  const { t } = useTranslation();
  const { authConfigured, profile } = useAuth();
  const { showToast, confirm } = useNotification();
  const [businessSettings, setBusinessSettings] = useState(initialBusinessSettings);
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [financeOverview, setFinanceOverview] = useState<FinanceOverview | null>(null);
  const [shopSettingsId, setShopSettingsId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>("staff");
  const [search, setSearch] = useState("");
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState(initialStaffForm);
  const [savingStaff, setSavingStaff] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editingLocationName, setEditingLocationName] = useState("");
  const [resetPasswordStaff, setResetPasswordStaff] = useState<StaffAccount | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(profile?.language || i18n.language || 'en');
  const [savingLanguage, setSavingLanguage] = useState(false);
  
  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);

  // Printer settings state
  const [printerSettings, setPrinterSettings] = useState<HospitalityPrinterSettings>(() =>
    printerService.getSettings(profile?.business_id || "")
  );
  const [savingPrinters, setSavingPrinters] = useState(false);
  const [newFoodCategory, setNewFoodCategory] = useState("");
  const [newDrinkCategory, setNewDrinkCategory] = useState("");
  const [testPrintJob, setTestPrintJob] = useState<"kitchen" | "bar" | null>(null);

  useEffect(() => {
    if (profile?.business_id) {
      printerService.loadSettingsAsync(profile.business_id).then(setPrinterSettings);
    }
  }, [profile?.business_id]);

  const handleSavePrinterSettings = async () => {
    if (!profile?.business_id) return;
    setSavingPrinters(true);
    try {
      await printerService.saveSettings(profile.business_id, printerSettings);
      showToast("success", "Printer & station routing settings saved successfully!");
    } catch (err: any) {
      showToast("error", err.message || "Failed to save printer settings");
    } finally {
      setSavingPrinters(false);
    }
  };

  const handleTestPrint = (job: "kitchen" | "bar") => {
    setTestPrintJob(job);
    setTimeout(() => {
      window.print();
      setTimeout(() => setTestPrintJob(null), 500);
    }, 250);
  };

  const handleSaveLanguage = async () => {
    if (!profile?.id) return;
    setSavingLanguage(true);
    try {
      await updateUserLanguage(profile.id, selectedLanguage);
      await i18n.changeLanguage(selectedLanguage);
      // Update cached profile
      const cached = localStorage.getItem('cached_user_profile');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          parsed.language = selectedLanguage;
          localStorage.setItem('cached_user_profile', JSON.stringify(parsed));
        } catch { /* ignore */ }
      }
      showToast('success', t('settings.personal.success'));
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save language preference');
    } finally {
      setSavingLanguage(false);
    }
  };

  const loadSettingsAndStaff = async () => {
    if (!profile?.business_id) {
      return;
    }

    try {
      const [settings, users, locs, finance] = await Promise.all([
        getShopSettingsRecord(profile.business_id), 
        listStaffAccounts(), 
        listLocations(),
        getFinanceOverview()
      ]);

      if (settings) {
        setShopSettingsId(settings.id);
        setBusinessSettings({
          name: settings.shop_name || "",
          address: settings.address || "",
          contact: settings.contact_phone || "",
          logoUrl: settings.logo_url || "",
          defaultProfitPercentage: String(settings.default_profit_percentage || ""),
          taxPercentage: String(settings.tax_percentage || ""),
          tinNumber: (settings as any).tin_number || "",
          vatRegistrationNumber: (settings as any).vat_registration_number || "",
          ebmSerialNumber: (settings as any).ebm_serial_number || "",
          vatRegistrationStatus: (settings as any).vat_registration_status === "registered" ? "registered" : "not_registered",
          vatPriceType: (settings as any).vat_price_type === "exclusive" ? "exclusive" : "inclusive",
          taxPeriod: (settings as any).tax_period === "quarterly" ? "quarterly" : "monthly",
        });
      }

      setStaffAccounts(users);
      setLocations(locs);
      setFinanceOverview(finance);
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  useRealtimeSync({
    onStaffChanged: () => void loadSettingsAndStaff(),
    onLocationChanged: () => void loadSettingsAndStaff(),
    onSettingsChanged: () => void loadSettingsAndStaff(),
    // Finance cards on settings page also need updates from sales/purchases
    onSaleCreated: () => void loadSettingsAndStaff(),
    onPurchaseCreated: () => void loadSettingsAndStaff(),
  });

  useEffect(() => {
    if (!authConfigured) return;

    let isMounted = true;

    async function loadSettingsAndStaff() {
      if (!profile?.business_id) {
        return;
      }

      try {
        const [settings, users, locs, finance] = await Promise.all([
          getShopSettingsRecord(profile.business_id), 
          listStaffAccounts(), 
          listLocations(),
          getFinanceOverview()
        ]);

        if (!isMounted) {
          return;
        }

        if (settings) {
          setShopSettingsId(settings.id);
          setBusinessSettings({
            name: settings.shop_name,
            address: settings.address ?? "",
            contact: settings.contact_phone ?? "",
            logoUrl: settings.logo_url ?? "",
            defaultProfitPercentage: String(settings.default_profit_percentage ?? ""),
            taxPercentage: String(settings.tax_percentage ?? ""),
            tinNumber: (settings as any).tin_number ?? "",
            vatRegistrationNumber: (settings as any).vat_registration_number ?? "",
            ebmSerialNumber: (settings as any).ebm_serial_number ?? "",
            vatRegistrationStatus: (settings as any).vat_registration_status === "registered" ? "registered" : "not_registered",
            vatPriceType: (settings as any).vat_price_type === "exclusive" ? "exclusive" : "inclusive",
            taxPeriod: (settings as any).tax_period === "quarterly" ? "quarterly" : "monthly",
          });
        }

        if (locs) {
          setLocations(locs);
        }

        if (finance) {
          setFinanceOverview(finance);
        }

        setStaffAccounts(
          (users ?? []).map((user) => ({
            id: user.id,
            auth_user_id: user.auth_user_id,
            fullName: user.full_name,
            email: user.email,
            phone: "",
            role: user.role,
            locationId: user.location_id,
            assignedLocationIds: (user as any).user_locations?.map((ul: any) => ul.location_id) || [],
            permissions: buildStaffPermissions(
              user.user_permissions?.map((permission: UserPermissionRecord) => ({
                module: permission.module_key,
                view: permission.can_view,
                add: permission.can_add,
                edit: permission.can_edit,
                remove: permission.can_delete,
              })),
            ),
          })),
        );
      } catch (error) {
        console.error(error);
      }
    }

    void loadSettingsAndStaff();

    return () => {
      isMounted = false;
    };
  }, [authConfigured, profile?.business_id]);

  useEffect(() => {
    if (activeSection === "api") {
      void (async () => {
        setLoadingApiKeys(true);
        try {
          const keys = await listApiKeys();
          setApiKeys(keys);
        } catch (e) {
          console.error(e);
        } finally {
          setLoadingApiKeys(false);
        }
      })();
    }
  }, [activeSection]);

  async function saveBusinessSettings() {
    if (!businessSettings.name.trim() || !businessSettings.contact.trim()) {
      return;
    }

    setSavingSettings(true);
    try {
      const saved = await upsertShopSettings({
        id: shopSettingsId ?? undefined,
        business_id: profile?.business_id || '',
        shop_name: businessSettings.name || '',
        address: businessSettings.address || '',
        contact_phone: businessSettings.contact || '',
        logo_url: businessSettings.logoUrl || '',
        currency_code: "RWF",
        default_profit_percentage: Number(businessSettings.defaultProfitPercentage) || 0,
        tax_percentage: Number(businessSettings.taxPercentage) || 0,
        tin_number: businessSettings.tinNumber || null,
        vat_registration_number: businessSettings.vatRegistrationNumber || null,
        ebm_serial_number: businessSettings.ebmSerialNumber || null,
        vat_registration_status: businessSettings.vatRegistrationStatus,
        vat_price_type: businessSettings.vatPriceType,
        tax_period: businessSettings.taxPeriod,
        updated_by: profile?.id ?? null,
      });

      setShopSettingsId(saved.id);
      setBusinessSettings({
        name: saved.shop_name || "",
        address: saved.address || "",
        contact: saved.contact_phone || "",
        logoUrl: saved.logo_url || "",
        defaultProfitPercentage: String(saved.default_profit_percentage || ""),
        taxPercentage: String(saved.tax_percentage || ""),
        tinNumber: (saved as any).tin_number || "",
        vatRegistrationNumber: (saved as any).vat_registration_number || "",
        ebmSerialNumber: (saved as any).ebm_serial_number || "",
        vatRegistrationStatus: (saved as any).vat_registration_status === "registered" ? "registered" : "not_registered",
        vatPriceType: (saved as any).vat_price_type === "exclusive" ? "exclusive" : "inclusive",
        taxPeriod: (saved as any).tax_period === "quarterly" ? "quarterly" : "monthly",
      });
      showToast("success", "Business settings updated!");
    } catch (error: any) {
      console.error(error);
      showToast("error", "Failed to save business settings: " + (error.message || "Unknown error"));
    } finally {
      setSavingSettings(false);
    }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500000) {
      showToast("warning", "Logo file is too large. Please use an image smaller than 500KB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setBusinessSettings(current => ({ ...current, logoUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  async function handleCreateLocation() {
    if (!newLocationName.trim()) return;
    setCreatingLocation(true);
    try {
      const loc = await createLocation(newLocationName.trim());
      if (loc) {
        setLocations((current) => [...current, loc]);
        setNewLocationName("");
        showToast("success", "Location '" + loc.name + "' created successfully!");
      }
    } catch (error: any) {
      console.error(error);
      showToast("error", "Failed to add location: " + (error.message || "Ensure you have admin permissions."));
    } finally {
      setCreatingLocation(false);
    }
  }

  async function handleUpdateLocation(id: string) {
    if (!editingLocationName.trim()) return;
    try {
      const updated = await updateLocation(id, { name: editingLocationName.trim() });
      if (updated) {
        setLocations((current) => current.map(l => l.id === id ? updated : l));
        setEditingLocationId(null);
        showToast("success", "Location updated.");
      }
    } catch (e) {
      console.error(e);
      showToast("error", "Failed to update location.");
    }
  }

  async function handleDeleteLocation(id: string) {
    const confirmed = await confirm("Delete Location", "Are you sure you want to delete this location? It may fail if there are stock records tied to it.");
    if (!confirmed) return;
    try {
      await deleteLocation(id);
      setLocations((current) => current.filter((l) => l.id !== id));
      showToast("success", "Location deleted.");
    } catch (e) {
      console.error(e);
      showToast("error", "Cannot delete location. It is likely tied to existing stock or users.");
    }
  }

  async function reloadStaffAccounts() {
    try {
      const users = await listStaffAccounts();
      setStaffAccounts(
        (users ?? []).map((user) => ({
          id: user.id,
          auth_user_id: user.auth_user_id,
          fullName: user.full_name,
          email: user.email,
          phone: "",
          role: user.role,
          locationId: user.location_id || null,
          assignedLocationIds: user.user_locations?.map((ul: any) => ul.location_id) || [],
          permissions:
            user.user_permissions?.map((permission: UserPermissionRecord) => ({
              module: permission.module_key,
              view: permission.can_view,
              add: permission.can_add,
              edit: permission.can_edit,
              remove: permission.can_delete,
            })) ?? moduleTemplates.map((item) => ({ ...item })),
        })),
      );
    } catch (error) {
      console.error(error);
    }
  }

  async function saveStaffAccount() {
    if (!staffForm.fullName.trim() || !staffForm.email.trim() || !staffForm.role) {
      showToast("warning", "Please fill in all required fields (Name, Email, Role).");
      return;
    }

    if (!editingStaffId && !staffForm.password.trim()) {
      showToast("warning", "Password is required for new accounts.");
      return;
    }

    setSavingStaff(true);

    try {
        const permissionsToSave = permissionRows.map((permission) => ({
          module_key: permission.module,
          can_view: permission.view,
          can_add: permission.add,
          can_edit: permission.edit,
          can_delete: permission.remove,
        }));

        let savedUserId = editingStaffId;

        if (editingStaffId) {
          await updateUserProfile(editingStaffId, {
            full_name: staffForm.fullName.trim(),
            email: staffForm.email.trim(),
            role: staffForm.role,
            location_id: staffForm.locationId,
          });
          await upsertUserPermissions(editingStaffId, permissionsToSave);
          
          if (staffForm.password.trim().length > 0) {
            if (staffForm.password.trim().length < 6) {
              throw new Error("Password must be at least 6 characters.");
            }
            const staff = staffAccounts.find(s => s.id === editingStaffId);
            if (staff?.auth_user_id) {
               await import("../lib/supabase").then(({ supabase }) => 
                 supabase.rpc('admin_reset_user_password', {
                   p_target_auth_id: staff.auth_user_id,
                   p_new_password: staffForm.password.trim()
                 })
               );
            }
          }
        } else {
          const created = await createStaffAccount({
            email: staffForm.email.trim(),
            password: staffForm.password.trim(),
            full_name: staffForm.fullName.trim(),
            role: staffForm.role,
            location_id: staffForm.locationId,
            permissions: permissionsToSave,
            business_id: profile?.business_id || "",
          });
          savedUserId = created.id;
        }

        if (savedUserId) {
          // Save multiple locations
          await upsertUserLocations(savedUserId, staffForm.assignedLocationIds);
        }

      await reloadStaffAccounts();
      showToast("success", "Staff account saved!");
      setStaffModalOpen(false);
      setEditingStaffId(null);
    } catch (error: any) {
      console.error(error);
      showToast("error", "Failed to save staff account: " + (error.message || "Unknown error"));
    } finally {
      setSavingStaff(false);
    }
  }

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return staffAccounts;
    }

    return staffAccounts.filter((staff) => {
      return (
        staff.fullName.toLowerCase().includes(query) ||
        staff.email.toLowerCase().includes(query) ||
        staff.role.toLowerCase().includes(query)
      );
    });
  }, [search, staffAccounts]);

  function openCreateStaffModal() {
    setEditingStaffId(null);
    setStaffForm({
      fullName: "",
      email: "",
      phone: "",
      role: "cashier",
      password: "",
      locationId: null,
      assignedLocationIds: [],
      permissions: buildStaffPermissions(),
    });
    setStaffModalOpen(true);
  }

  function openEditStaffModal(staff: StaffAccount) {
    setEditingStaffId(staff.id);
    setStaffForm({
      fullName: staff.fullName,
      email: staff.email,
      phone: staff.phone,
      role: staff.role,
      password: "",
      locationId: staff.locationId,
      assignedLocationIds: staff.assignedLocationIds || [],
      permissions: buildStaffPermissions(staff.permissions),
    });
    setStaffModalOpen(true);
  }

  async function deleteStaffAccount(userId: string) {
    const confirmed = await confirm("Delete Staff Account", "Are you sure you want to permanentely delete this staff profile?");
    if (!confirmed) return;

    try {
      await deleteUserProfile(userId);
      setStaffAccounts((current) => current.filter((staff) => staff.id !== userId));
    } catch (error) {
      console.error(error);
    }
  }

  function togglePermission(moduleName: string, key: keyof Omit<StaffPermission, "module">) {
    if (staffForm.role === "admin") return; // Admins have all permissions by default

    setStaffForm((current) => ({
      ...current,
      permissions: current.permissions.map((permission) =>
        permission.module === moduleName ? { ...permission, [key]: !permission[key] } : permission,
      ),
    }));
  }

  const permissionRows = useMemo(() => {
    const base = staffForm.permissions.length > 0 ? staffForm.permissions : buildStaffPermissions();
    if (staffForm.role === "admin") {
      return base.map(p => ({ ...p, view: true, add: true, edit: true, remove: true }));
    }
    return base;
  }, [staffForm.role, staffForm.permissions]);

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">{t('settings.preferences')}</p>
        <h2 className="mt-1 text-3xl font-bold text-ink">{t('settings.title')}</h2>
      </div>


      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-white p-5 shadow-soft">
          <p className="text-sm text-slate-500">{t('settings.stats.auth')}</p>
          <p className="mt-2 text-2xl font-bold text-ink">{authConfigured ? t('settings.status.connected') : t('settings.status.not_configured')}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-soft">
          <p className="text-sm text-slate-500">{t('settings.stats.admin')}</p>
          <p className="mt-2 text-2xl font-bold text-ink">{profile?.full_name ?? t('settings.status.no_session')}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-soft">
          <p className="text-sm text-slate-500">{t('settings.stats.role')}</p>
          <p className="mt-2 text-2xl font-bold text-ink">{profile?.role ?? t('settings.status.unknown')}</p>
        </div>
      </div>

      <div className="rounded-3xl bg-white p-3 shadow-soft">
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
          {[
            { id: "preferences", label: t('settings.personal.title'), icon: Globe },
            { id: "staff", label: t('settings.nav.staff'), icon: ShieldCheck },
            { id: "business", label: t('settings.nav.business'), icon: Building2 },
            { id: "printers", label: "Printers & Stations", icon: Printer },
            { id: "tax", label: "Tax Settings", icon: WalletCards },
            { id: "finance", label: t('settings.nav.finance'), icon: WalletCards },
            { id: "locations", label: t('settings.nav.locations'), icon: MapPin },
            { id: "api", label: t('settings.nav.api'), icon: Code2 },
          ].map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;

            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id as SettingsSection)}
                className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isActive
                    ? "bg-brand-500 text-white shadow-[0_18px_35px_rgba(37,99,235,0.22)]"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Icon size={16} />
                {section.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeSection === "preferences" ? (
        <SectionCard title={t('settings.personal.title')} subtitle={t('settings.personal.subtitle')}>
          <div className="max-w-md space-y-5">
            <div className="rounded-2xl bg-indigo-50 p-4">
              <div className="flex items-center gap-3 mb-2">
                <Globe size={18} className="text-indigo-600" />
                <p className="text-sm font-semibold text-indigo-800">{t('settings.personal.language')}</p>
              </div>
              <p className="text-xs text-indigo-600 mb-4">{t('settings.personal.language_desc')}</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { code: 'en', label: 'English', flag: '🇬🇧' },
                  { code: 'rw', label: 'Kinyarwanda', flag: '🇷🇼' },
                  { code: 'fr', label: 'Français', flag: '🇫🇷' },
                ].map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => setSelectedLanguage(lang.code)}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-sm font-semibold transition ${
                      selectedLanguage === lang.code
                        ? 'border-indigo-500 bg-indigo-100 text-indigo-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'
                    }`}
                  >
                    <span className="text-2xl">{lang.flag}</span>
                    <span className="text-xs">{lang.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleSaveLanguage}
              disabled={savingLanguage}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.25)] transition hover:bg-brand-600 disabled:opacity-60"
            >
              <Globe size={16} />
              {savingLanguage ? t('common.saving') : t('settings.personal.save_btn')}
            </button>
          </div>
        </SectionCard>
      ) : null}

      {activeSection === "staff" ? (
        <SectionCard title={t('settings.staff.title')} subtitle={t('settings.staff.subtitle')}>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="flex w-full items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
              <Search size={16} className="text-brand-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full border-none bg-transparent text-sm outline-none"
                placeholder={t('settings.staff.search_placeholder')}
              />
            </label>
            <button
              onClick={openCreateStaffModal}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white"
            >
              <Plus size={16} />
              {t('settings.staff.add_btn')}
            </button>
          </div>

          <div className="overflow-hidden rounded-3xl border border-brand-100 shadow-[0_20px_50px_rgba(37,99,235,0.08)]">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 text-white">
                  <tr>
                    {[t('settings.staff.col_staff'), t('settings.staff.col_role'), t('settings.staff.col_location'), t('settings.personal.language'), t('settings.staff.col_permissions'), t('settings.staff.col_actions')].map((column) => (
                      <th key={column} className="border-b border-white/10 px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-100">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {filteredStaff.map((staff) => (
                    <tr key={staff.id} className="transition hover:bg-brand-50/40">
                      <td className="border-b border-slate-100 px-5 py-4">
                        <p className="font-semibold text-ink">{staff.fullName}</p>
                        <p className="mt-1 text-xs text-slate-500">{staff.email}</p>
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {staff.role}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <MapPin size={14} className="text-slate-400" />
                          <span className="text-xs font-medium">
                            {(staff.assignedLocationIds?.length || 0) > 0 
                              ? locations.filter(l => staff.assignedLocationIds?.includes(l.id)).map(l => l.name).join(", ")
                              : staff.role === "admin" ? t('settings.staff.global_access') : t('settings.staff.no_locations')}
                          </span>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                          {(staff as any).language || 'en'}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {staff.permissions?.filter((permission: any) => permission.view || permission.add || permission.edit || permission.remove)
                            .map((permission: any) => (
                              <span key={permission.module} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                                {permission.module}
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-5 py-4 flex gap-2">
                        <button
                          onClick={() => setResetPasswordStaff(staff)}
                          className="rounded-xl bg-indigo-50 p-2 text-indigo-600 transition hover:bg-indigo-100"
                          title={t('settings.staff.reset_pw')}
                        >
                          <Key size={16} />
                        </button>
                        <button
                          onClick={() => openEditStaffModal(staff)}
                          className="rounded-xl bg-sky-50 p-2 text-sky-600 transition hover:bg-sky-100"
                          title={t('settings.staff.edit_staff')}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => deleteStaffAccount(staff.id)}
                          className="rounded-xl bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100"
                          title={t('settings.staff.delete_staff')}
                        >
                          <X size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {activeSection === "business" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <SectionCard title={t('settings.business.title')} subtitle={t('settings.business.subtitle')}>
            <div className="grid gap-3">
              <label className="rounded-2xl bg-slate-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('settings.business.name')}</span>
                <input
                  value={businessSettings.name}
                  onChange={(event) => setBusinessSettings((current) => ({ ...current, name: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                />
              </label>
              <label className="rounded-2xl bg-sky-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">{t('settings.business.address')}</span>
                <input
                  value={businessSettings.address}
                  onChange={(event) => setBusinessSettings((current) => ({ ...current, address: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm outline-none"
                />
              </label>
              <label className="rounded-2xl bg-emerald-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{t('settings.business.contact')}</span>
                <input
                  value={businessSettings.contact}
                  onChange={(event) => setBusinessSettings((current) => ({ ...current, contact: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm outline-none"
                />
              </label>
              <div className="rounded-2xl bg-amber-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">{t('settings.business.logo')}</span>
                <div className="mt-3 flex items-center gap-4">
                  {businessSettings.logoUrl ? (
                    <img src={businessSettings.logoUrl} alt="Logo Preview" className="h-16 w-16 rounded-xl object-contain bg-white shadow-sm" />
                  ) : (
                    <div className="h-16 w-16 rounded-xl bg-amber-100 flex items-center justify-center text-amber-500">
                      <Building2 size={24} />
                    </div>
                  )}
                  <label className="flex-1">
                    <div className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-amber-200 bg-white px-4 py-3 text-sm font-medium text-amber-700 transition hover:border-amber-400 hover:bg-amber-50/50">
                      <span>{t('settings.business.logo_upload')}</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                {businessSettings.logoUrl && (
                  <button 
                    onClick={() => setBusinessSettings(c => ({ ...c, logoUrl: "" }))}
                    className="mt-2 text-xs text-rose-600 font-semibold hover:underline"
                  >
                    {t('settings.business.logo_remove')}
                  </button>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t('settings.finance.title')} subtitle={t('settings.finance.subtitle')}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="rounded-2xl bg-brand-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">{t('settings.finance.profit_label')}</span>
                <input
                  value={businessSettings.defaultProfitPercentage}
                  onChange={(event) =>
                    setBusinessSettings((current) => ({ ...current, defaultProfitPercentage: event.target.value }))
                  }
                  className="mt-2 w-full rounded-xl border border-brand-200 bg-white px-3 py-2.5 text-sm outline-none"
                />
              </label>
              <label className="rounded-2xl bg-rose-50 p-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">{t('settings.finance.tax_label')}</span>
                <input
                  value={businessSettings.taxPercentage}
                  onChange={(event) =>
                    setBusinessSettings((current) => ({ ...current, taxPercentage: event.target.value }))
                  }
                  className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm outline-none"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <Building2 size={18} className="text-brand-600" />
                  <p className="text-sm font-semibold text-ink">{t('settings.finance.profit_applied')}</p>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {t('settings.finance.profit_desc')}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <WalletCards size={18} className="text-rose-600" />
                  <p className="text-sm font-semibold text-ink">{t('settings.finance.tax_calc')}</p>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {t('settings.finance.tax_desc')}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={saveBusinessSettings}
                disabled={savingSettings}
                className="rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingSettings ? t('common.saving') : t('settings.business.save_btn')}
              </button>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeSection === "tax" ? (
        <SectionCard title="Tax Settings" subtitle="Configure Rwanda VAT registration and reporting rules.">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="rounded-2xl bg-slate-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Business Name</span>
                  <input
                    value={businessSettings.name}
                    onChange={(event) => setBusinessSettings((current) => ({ ...current, name: event.target.value }))}
                    title="The legal or trading name used on tax reports."
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                  />
                </label>
                <label className="rounded-2xl bg-sky-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">TIN Number</span>
                  <input
                    value={businessSettings.tinNumber}
                    onChange={(event) => setBusinessSettings((current) => ({ ...current, tinNumber: event.target.value }))}
                    title="Taxpayer Identification Number issued to the business."
                    className="mt-2 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm outline-none"
                  />
                </label>
                <label className="rounded-2xl bg-emerald-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">VAT Registration Number</span>
                  <input
                    value={businessSettings.vatRegistrationNumber}
                    onChange={(event) => setBusinessSettings((current) => ({ ...current, vatRegistrationNumber: event.target.value }))}
                    disabled={businessSettings.vatRegistrationStatus !== "registered"}
                    title="Used only when the business is VAT registered."
                    className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </label>
                <label className="rounded-2xl bg-amber-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">EBM Serial Number</span>
                  <input
                    value={businessSettings.ebmSerialNumber}
                    onChange={(event) => setBusinessSettings((current) => ({ ...current, ebmSerialNumber: event.target.value }))}
                    title="Optional Electronic Billing Machine serial number for future RRA EBM integration."
                    className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm outline-none"
                  />
                </label>
              </div>

              <div className="rounded-3xl border border-slate-100 bg-white p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Tax Registration</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { id: "not_registered", label: "Not VAT Registered", desc: "VAT calculations, reports, and Tax to Pay are hidden." },
                    { id: "registered", label: "VAT Registered", desc: "Output VAT minus Input VAT is calculated automatically." },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setBusinessSettings((current) => ({ ...current, vatRegistrationStatus: option.id as any }))}
                      className={`rounded-2xl border p-4 text-left transition ${
                        businessSettings.vatRegistrationStatus === option.id
                          ? "border-brand-500 bg-brand-50 text-brand-800"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <span className="block text-sm font-black">{option.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed">{option.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`grid gap-3 md:grid-cols-3 ${businessSettings.vatRegistrationStatus !== "registered" ? "opacity-45" : ""}`}>
                <label className="rounded-2xl bg-rose-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">VAT Rate</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={businessSettings.taxPercentage}
                    disabled={businessSettings.vatRegistrationStatus !== "registered"}
                    onChange={(event) => setBusinessSettings((current) => ({ ...current, taxPercentage: event.target.value }))}
                    title="Default Rwanda VAT rate is 18%. Change this only if tax law changes."
                    className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </label>
                <label className="rounded-2xl bg-indigo-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">Price Type</span>
                  <select
                    value={businessSettings.vatPriceType}
                    disabled={businessSettings.vatRegistrationStatus !== "registered"}
                    onChange={(event) => setBusinessSettings((current) => ({ ...current, vatPriceType: event.target.value as any }))}
                    title="Choose whether entered prices already include VAT or VAT should be added on top."
                    className="mt-2 w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    <option value="inclusive">Prices Include VAT</option>
                    <option value="exclusive">Prices Exclude VAT</option>
                  </select>
                </label>
                <label className="rounded-2xl bg-cyan-50 p-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Tax Period</span>
                  <select
                    value={businessSettings.taxPeriod}
                    disabled={businessSettings.vatRegistrationStatus !== "registered"}
                    onChange={(event) => setBusinessSettings((current) => ({ ...current, taxPeriod: event.target.value as any }))}
                    title="Monthly is common for VAT reporting; quarterly can be used if the business reports quarterly."
                    className="mt-2 w-full rounded-xl border border-cyan-200 bg-white px-3 py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </label>
              </div>

              <button
                type="button"
                onClick={saveBusinessSettings}
                disabled={savingSettings}
                className="rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingSettings ? t('common.saving') : "Save Tax Settings"}
              </button>
            </div>

            <div className="space-y-4">
              <div className={`rounded-3xl p-5 ${
                businessSettings.vatRegistrationStatus === "registered"
                  ? "border border-emerald-100 bg-emerald-50 text-emerald-900"
                  : "border border-slate-200 bg-slate-50 text-slate-700"
              }`}>
                <p className="text-xs font-black uppercase tracking-widest opacity-70">Current VAT Status</p>
                <p className="mt-2 text-2xl font-black">
                  {businessSettings.vatRegistrationStatus === "registered" ? "VAT Enabled" : "VAT Disabled"}
                </p>
                <p className="mt-2 text-sm leading-relaxed">
                  {businessSettings.vatRegistrationStatus === "registered"
                    ? "The system will calculate Output VAT on sales and Input VAT on eligible supplier purchases."
                    : "VAT reports and Tax to Pay widgets stay hidden until the business is marked as VAT registered."}
                </p>
              </div>
              <div className="rounded-3xl border border-sky-100 bg-sky-50 p-5 text-sky-900">
                <p className="text-xs font-black uppercase tracking-widest text-sky-500">Simple Rule</p>
                <p className="mt-2 text-sm leading-relaxed">
                  VAT Payable is Output VAT minus Input VAT. If Input VAT is higher, payable VAT is shown as 0 and the balance becomes VAT Credit to carry forward.
                </p>
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {activeSection === "finance" ? (
        <SectionCard title={t('settings.totals.title')} subtitle={t('settings.totals.subtitle')}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { title: t('settings.totals.sales_today'), value: financeOverview ? formatCurrency(Math.round(financeOverview.salesToday)) : t('common.loading'), tone: "bg-sky-50 text-sky-700" },
              { title: t('settings.totals.sales_month'), value: financeOverview ? formatCurrency(Math.round(financeOverview.salesMonth)) : t('common.loading'), tone: "bg-emerald-50 text-emerald-700" },
              { title: t('settings.totals.sales_year'), value: financeOverview ? formatCurrency(Math.round(financeOverview.salesYear)) : t('common.loading'), tone: "bg-indigo-50 text-indigo-700" },
              { title: t('settings.totals.purchases_total'), value: financeOverview ? formatCurrency(Math.round(financeOverview.purchasesTotal)) : t('common.loading'), tone: "bg-amber-50 text-amber-700" },
              { title: t('settings.totals.supplier_due'), value: financeOverview ? formatCurrency(Math.round(financeOverview.supplierDue)) : t('common.loading'), tone: "bg-rose-50 text-rose-700" },
              { title: t('settings.totals.supplier_paid'), value: financeOverview ? formatCurrency(Math.round(financeOverview.supplierPaid)) : t('common.loading'), tone: "bg-emerald-50 text-emerald-700" },
              { title: t('settings.totals.customer_unpaid'), value: financeOverview ? formatCurrency(Math.round(financeOverview.customerUnpaid)) : t('common.loading'), tone: "bg-orange-50 text-orange-700" },
              { title: t('settings.totals.tax_est'), value: financeOverview ? formatCurrency(Math.round(financeOverview.taxEstimation)) : t('common.loading'), tone: "bg-brand-50 text-brand-700" },
            ].map((card) => (
              <div key={card.title} className={`rounded-3xl p-5 ${card.tone}`}>
                <p className="text-sm font-semibold">{card.title}</p>
                <p className="mt-3 text-2xl font-bold">{card.value}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {activeSection === "api" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
          <SectionCard title={t('settings.api.title')} subtitle={t('settings.api.subtitle')}>
            <div className="space-y-4">
              <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-5">
                <p className="text-sm font-semibold text-brand-700">{t('settings.api.new_key')}</p>
                <p className="mt-1 text-xs text-brand-600">{t('settings.api.new_key_desc')}</p>
                
                <div className="mt-4 space-y-3">
                  <input
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-full rounded-2xl border border-brand-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                    placeholder={t('settings.api.key_placeholder')}
                  />
                  <button
                    onClick={() => {
                      if (!newKeyName.trim()) return;
                      void (async () => {
                        try {
                          const { fullKey, ...record } = await generateApiKey(newKeyName);
                          setGeneratedKey(fullKey);
                          setApiKeys(prev => [record, ...prev]);
                          setNewKeyName("");
                          showToast("success", "API Key Generated!");
                        } catch (error: any) {
                          showToast("error", error?.message || "API key table is not available. Apply the latest Supabase migration.");
                        }
                      })();
                    }}
                    className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-brand-600"
                  >
                    {t('settings.api.generate_btn')}
                  </button>
                </div>
              </div>

              {generatedKey && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 animate-fade-in shadow-lg shadow-emerald-100/50">
                  <div className="flex items-center gap-2 text-emerald-700 mb-2">
                    <ShieldCheck size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">{t('settings.api.security_alert')}</span>
                  </div>
                  <p className="text-sm text-emerald-800">{t('settings.api.security_desc')}</p>
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white border border-emerald-100 px-4 py-3 font-mono text-xs text-ink">
                    <span className="break-all">{generatedKey}</span>
                    <button 
                      onClick={() => {
                        void navigator.clipboard.writeText(generatedKey);
                        showToast("success", "Key copied to clipboard!");
                      }}
                      className="text-emerald-600 hover:text-emerald-700 font-bold uppercase transition"
                    >
                      {t('common.copy')}
                    </button>
                  </div>
                  <button 
                    onClick={() => setGeneratedKey(null)}
                    className="mt-4 w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white"
                  >
                    {t('settings.api.saved_btn')}
                  </button>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title={t('settings.api.active_keys')} subtitle={t('settings.api.active_keys_subtitle')}>
            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider">{t('settings.api.col_name')}</th>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider">{t('settings.api.col_used')}</th>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider">{t('settings.api.col_prefix')}</th>
                    <th className="px-5 py-3 text-center text-xs font-bold uppercase tracking-wider">{t('settings.api.col_actions')}</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {apiKeys.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-slate-400 italic">
                        {t('settings.api.no_keys')}
                      </td>
                    </tr>
                  ) : (
                    apiKeys.map(key => (
                      <tr key={key.id} className="border-t border-slate-50 transition hover:bg-slate-50/50">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-slate-100 p-2 text-slate-400">
                              <Key size={14} />
                            </div>
                            <span className="font-semibold text-ink">{key.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-500">
                          {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : t('common.never')}
                        </td>
                        <td className="px-5 py-4">
                          <code className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{key.key_prefix}****</code>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button 
                            onClick={() => {
                              void (async () => {
                                const confirmed = await confirm(t('settings.api.revoke_title'), t('settings.api.revoke_desc'));
                                if (!confirmed) return;
                                await revokeApiKey(key.id);
                                setApiKeys(prev => prev.filter(k => k.id !== key.id));
                                showToast("success", t('settings.api.revoke_success'));
                              })();
                            }}
                            className="rounded-xl p-2 text-rose-300 transition hover:bg-rose-50 hover:text-rose-600"
                            title={t('settings.api.revoke_btn')}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeSection === "locations" ? (
        <SectionCard title={t('settings.locations.title')} subtitle={t('settings.locations.subtitle')}>
          <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="flex w-full items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
              <MapPin size={16} className="text-brand-500" />
              <input
                value={newLocationName}
                onChange={(event) => setNewLocationName(event.target.value)}
                className="w-full border-none bg-transparent text-sm outline-none"
                placeholder={t('settings.locations.placeholder')}
              />
            </label>
            <button
              onClick={handleCreateLocation}
              disabled={creatingLocation || !newLocationName.trim()}
              className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus size={16} />
              {creatingLocation ? t('common.adding') : t('settings.locations.add_btn')}
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {locations.length === 0 ? (
              <div className="col-span-full rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                {t('settings.locations.no_records')}
              </div>
            ) : null}
            {locations.map((loc) => (
              <div key={loc.id} className="flex items-center justify-between rounded-3xl border border-slate-100 bg-white p-5 shadow-soft transition hover:border-brand-200">
                <div className="flex flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <MapPin size={20} />
                  </div>
                  <div className="flex-1">
                    {editingLocationId === loc.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={editingLocationName}
                          onChange={(e) => setEditingLocationName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateLocation(loc.id)}
                          className="w-full rounded-lg border border-brand-200 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <button 
                          onClick={() => handleUpdateLocation(loc.id)}
                          className="rounded-lg bg-emerald-500 p-1.5 text-white hover:bg-emerald-600"
                        >
                          <ShieldCheck size={16} />
                        </button>
                        <button 
                          onClick={() => setEditingLocationId(null)}
                          className="rounded-lg bg-slate-200 p-1.5 text-slate-700 hover:bg-slate-300"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 className="font-bold text-ink">{loc.name}</h3>
                        <p className="text-xs text-slate-500">ID: {loc.id.substring(0, 8)}</p>
                      </>
                    )}
                  </div>
                </div>
                {!editingLocationId && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingLocationId(loc.id);
                        setEditingLocationName(loc.name);
                      }}
                      className="rounded-xl p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-500"
                      title={t('settings.locations.edit_btn')}
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteLocation(loc.id)}
                      className="rounded-xl p-2 text-rose-500 transition hover:bg-rose-50"
                      title={t('settings.locations.delete_btn')}
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {activeSection === "printers" ? (
        <SectionCard
          title="Hospitality Printer Routing (Bar & Kitchen)"
          subtitle="Configure automated ticket routing: Food orders print to the Kitchen, and Drinks / Full bills print to the Bar"
        >
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* KITCHEN PRINTER STATION */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                        <Utensils size={22} />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900">Kitchen Food Station</h3>
                        <p className="text-xs text-slate-500">Chef preparation ticket (Food only)</p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                        printerSettings.kitchen.enabled
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          printerSettings.kitchen.enabled ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                      />
                      {printerSettings.kitchen.enabled ? "Active" : "Disabled"}
                    </span>
                  </div>

                  {/* Toggle: Enabled */}
                  <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 cursor-pointer hover:bg-slate-100/80 transition">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Enable Kitchen Printer</p>
                      <p className="text-[11px] text-slate-500">Allow generating Kitchen Order Tickets (KOT)</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={printerSettings.kitchen.enabled}
                      onChange={(e) =>
                        setPrinterSettings((prev) => ({
                          ...prev,
                          kitchen: { ...prev.kitchen, enabled: e.target.checked },
                        }))
                      }
                      className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </label>

                  {/* Toggle: Auto-Print */}
                  <label className="flex items-center justify-between p-3 rounded-2xl bg-amber-50/50 border border-amber-100 cursor-pointer hover:bg-amber-50 transition">
                    <div>
                      <p className="text-xs font-black text-amber-900">Auto-Print on Checkout / Order</p>
                      <p className="text-[11px] text-amber-700">
                        Automatically sends ticket to kitchen when cashier sells food
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={printerSettings.kitchen.auto_print}
                      onChange={(e) =>
                        setPrinterSettings((prev) => ({
                          ...prev,
                          kitchen: { ...prev.kitchen, auto_print: e.target.checked },
                        }))
                      }
                      className="h-5 w-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                  </label>

                  {/* Paper Width */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Paper Width</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["80mm", "58mm"] as const).map((width) => (
                        <button
                          key={width}
                          type="button"
                          onClick={() =>
                            setPrinterSettings((prev) => ({
                              ...prev,
                              kitchen: { ...prev.kitchen, paper_width: width },
                            }))
                          }
                          className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                            printerSettings.kitchen.paper_width === width
                              ? "border-brand-500 bg-brand-50 text-brand-700"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {width} {width === "80mm" ? "(Standard POS)" : "(Compact)"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Categories for Kitchen */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Food Categories Routed to Kitchen ({printerSettings.kitchen.categories.length})
                    </label>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                      {printerSettings.kitchen.categories.map((cat) => (
                        <span
                          key={cat}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-xs"
                        >
                          {cat}
                          <button
                            type="button"
                            onClick={() =>
                              setPrinterSettings((prev) => ({
                                ...prev,
                                kitchen: {
                                  ...prev.kitchen,
                                  categories: prev.kitchen.categories.filter((c) => c !== cat),
                                },
                              }))
                            }
                            className="text-slate-400 hover:text-rose-600 ml-0.5"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        placeholder="Add category (e.g. Seafood, Burger)..."
                        value={newFoodCategory}
                        onChange={(e) => setNewFoodCategory(e.target.value)}
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-brand-300"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            newFoodCategory.trim() &&
                            !printerSettings.kitchen.categories.includes(newFoodCategory.trim())
                          ) {
                            setPrinterSettings((prev) => ({
                              ...prev,
                              kitchen: {
                                ...prev.kitchen,
                                categories: [...prev.kitchen.categories, newFoodCategory.trim()],
                              },
                            }));
                            setNewFoodCategory("");
                          }
                        }}
                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-black transition"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 italic bg-amber-50/50 p-2.5 rounded-xl border border-amber-100">
                    💡 <strong>Kitchen tickets strictly show food items</strong> with table/room number, order timestamp, and clear quantities for the chef. Prices are not shown on chef tickets.
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4">
                  <button
                    type="button"
                    onClick={() => handleTestPrint("kitchen")}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 py-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition"
                  >
                    <Printer size={15} /> Test Print Kitchen Ticket (Food Only)
                  </button>
                </div>
              </div>

              {/* BAR & BEVERAGE STATION */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                        <Wine size={22} />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900">Bar Station</h3>
                        <p className="text-xs text-slate-500">Drinks ticket or Full customer bill</p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                        printerSettings.bar.enabled
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          printerSettings.bar.enabled ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                      />
                      {printerSettings.bar.enabled ? "Active" : "Disabled"}
                    </span>
                  </div>

                  {/* Toggle: Enabled */}
                  <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 cursor-pointer hover:bg-slate-100/80 transition">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Enable Bar Printer</p>
                      <p className="text-[11px] text-slate-500">Allow receipt & drinks printing at the bar</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={printerSettings.bar.enabled}
                      onChange={(e) =>
                        setPrinterSettings((prev) => ({
                          ...prev,
                          bar: { ...prev.bar, enabled: e.target.checked },
                        }))
                      }
                      className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </label>

                  {/* Toggle: Auto-Print */}
                  <label className="flex items-center justify-between p-3 rounded-2xl bg-indigo-50/50 border border-indigo-100 cursor-pointer hover:bg-indigo-50 transition">
                    <div>
                      <p className="text-xs font-black text-indigo-900">Auto-Print on Checkout</p>
                      <p className="text-[11px] text-indigo-700">
                        Automatically prints bar receipt when payment is finalized
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={printerSettings.bar.auto_print}
                      onChange={(e) =>
                        setPrinterSettings((prev) => ({
                          ...prev,
                          bar: { ...prev.bar, auto_print: e.target.checked },
                        }))
                      }
                      className="h-5 w-5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>

                  {/* Print Mode Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Bar Receipt Print Mode
                    </label>
                    <div className="space-y-2">
                      <label
                        className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition ${
                          printerSettings.bar.print_mode === "full"
                            ? "border-brand-500 bg-brand-50/50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="bar_print_mode"
                          checked={printerSettings.bar.print_mode === "full"}
                          onChange={() =>
                            setPrinterSettings((prev) => ({
                              ...prev,
                              bar: { ...prev.bar, print_mode: "full" },
                            }))
                          }
                          className="mt-0.5 text-brand-600 focus:ring-brand-500"
                        />
                        <div>
                          <p className="text-xs font-black text-slate-900">
                            Combined Full Receipt (Bar + Kitchen)
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Customer receipt listing both drinks and kitchen food with prices, totals, and payment details.
                          </p>
                        </div>
                      </label>

                      <label
                        className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition ${
                          printerSettings.bar.print_mode === "drinks_only"
                            ? "border-brand-500 bg-brand-50/50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="bar_print_mode"
                          checked={printerSettings.bar.print_mode === "drinks_only"}
                          onChange={() =>
                            setPrinterSettings((prev) => ({
                              ...prev,
                              bar: { ...prev.bar, print_mode: "drinks_only" },
                            }))
                          }
                          className="mt-0.5 text-brand-600 focus:ring-brand-500"
                        />
                        <div>
                          <p className="text-xs font-black text-slate-900">
                            Drinks Only Preparation Ticket
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Prints only beverage/bar items for the bartender without kitchen meals.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Paper Width */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Paper Width</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["80mm", "58mm"] as const).map((width) => (
                        <button
                          key={width}
                          type="button"
                          onClick={() =>
                            setPrinterSettings((prev) => ({
                              ...prev,
                              bar: { ...prev.bar, paper_width: width },
                            }))
                          }
                          className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                            printerSettings.bar.paper_width === width
                              ? "border-brand-500 bg-brand-50 text-brand-700"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {width} {width === "80mm" ? "(Standard POS)" : "(Compact)"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Categories for Bar */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Drink Categories Routed to Bar ({printerSettings.bar.categories.length})
                    </label>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                      {printerSettings.bar.categories.map((cat) => (
                        <span
                          key={cat}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-xs"
                        >
                          {cat}
                          <button
                            type="button"
                            onClick={() =>
                              setPrinterSettings((prev) => ({
                                ...prev,
                                bar: {
                                  ...prev.bar,
                                  categories: prev.bar.categories.filter((c) => c !== cat),
                                },
                              }))
                            }
                            className="text-slate-400 hover:text-rose-600 ml-0.5"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        placeholder="Add drink category (e.g. Gin, Mocktail)..."
                        value={newDrinkCategory}
                        onChange={(e) => setNewDrinkCategory(e.target.value)}
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-brand-300"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            newDrinkCategory.trim() &&
                            !printerSettings.bar.categories.includes(newDrinkCategory.trim())
                          ) {
                            setPrinterSettings((prev) => ({
                              ...prev,
                              bar: {
                                ...prev.bar,
                                categories: [...prev.bar.categories, newDrinkCategory.trim()],
                              },
                            }));
                            setNewDrinkCategory("");
                          }
                        }}
                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-black transition"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4">
                  <button
                    type="button"
                    onClick={() => handleTestPrint("bar")}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 py-2.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100 transition"
                  >
                    <Printer size={15} /> Test Print Bar Receipt
                  </button>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleSavePrinterSettings}
                disabled={savingPrinters}
                className="flex items-center gap-2 rounded-2xl bg-brand-600 px-6 py-3 text-sm font-black text-white shadow-soft hover:bg-brand-700 transition disabled:opacity-50"
              >
                <CheckCircle2 size={18} />
                <span>{savingPrinters ? "Saving Configurations..." : "Save Printer Settings"}</span>
              </button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {/* Hidden Print Testing Portals */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #kitchen-ticket-print, #kitchen-ticket-print * { visibility: visible !important; }
          #bar-receipt-print, #bar-receipt-print * { visibility: visible !important; }
          #bar-ticket-print, #bar-ticket-print * { visibility: visible !important; }
          #kitchen-ticket-print, #bar-receipt-print, #bar-ticket-print {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            margin: 0 !important;
          }
          @page { size: auto; margin: 0; }
        }
      `}</style>
      {testPrintJob === "kitchen" && (
        <div className="print-doc">
          <KitchenOrderTicket
            ticketNumber="KOT-TEST"
            destination="Table 04"
            cashierName={profile?.full_name || "Cashier"}
            createdAt={new Date().toISOString()}
            paperWidth={printerSettings.kitchen.paper_width}
            items={[
              { name: "Grilled Beef Steak with Chips", quantity: 2, notes: "Medium well" },
              { name: "Chicken Brochette", quantity: 3, notes: "Spicy" },
            ]}
          />
        </div>
      )}
      {testPrintJob === "bar" && (
        <div className="print-doc">
          <BarReceipt
            mode={printerSettings.bar.print_mode}
            saleNumber="BAR-TEST-01"
            destination="Table 04"
            createdAt={new Date().toISOString()}
            cashierName={profile?.full_name || "Cashier"}
            paperWidth={printerSettings.bar.paper_width}
            items={
              printerSettings.bar.print_mode === "drinks_only"
                ? [
                    { name: "Skol Lager 500ml", quantity: 2, unit_price: 1500, line_total: 3000 },
                    { name: "Fresh Passion Juice", quantity: 1, unit_price: 2000, line_total: 2000 },
                  ]
                : [
                    { name: "Skol Lager 500ml", quantity: 2, unit_price: 1500, line_total: 3000 },
                    { name: "Fresh Passion Juice", quantity: 1, unit_price: 2000, line_total: 2000 },
                    { name: "Grilled Beef Steak with Chips", quantity: 2, unit_price: 7000, line_total: 14000 },
                  ]
            }
            subtotal={19000}
            taxAmount={0}
            discountAmount={0}
            totalAmount={19000}
            paymentMethod="Cash"
            amountPaid={20000}
            change={1000}
            settings={{
              shop_name: businessSettings.name,
              address: businessSettings.address,
              contact_phone: businessSettings.contact,
            } as any}
          />
        </div>
      )}

      {staffModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm" onClick={() => setStaffModalOpen(false)}>
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">
                  {editingStaffId ? t('settings.staff_modal.edit_title') : t('settings.staff_modal.create_title')}
                </p>
                <h2 className="mt-1 text-2xl font-bold text-ink">
                  {editingStaffId ? staffForm.fullName : t('settings.staff_modal.permissions')}
                </h2>
              </div>
              <button onClick={() => setStaffModalOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 overflow-y-auto px-5 py-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-3">
                <label className="rounded-2xl bg-slate-50 p-3 block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('settings.staff_modal.name')}</span>
                  <input
                    value={staffForm.fullName}
                    onChange={(event) => setStaffForm((current) => ({ ...current, fullName: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                  />
                </label>
                <label className="rounded-2xl bg-sky-50 p-3 block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">{t('settings.staff_modal.email')}</span>
                  <input
                    value={staffForm.email}
                    onChange={(event) => setStaffForm((current) => ({ ...current, email: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm outline-none"
                  />
                </label>
                <label className="rounded-2xl bg-emerald-50 p-3 block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{t('common.phone')}</span>
                  <input
                    value={staffForm.phone}
                    onChange={(event) => setStaffForm((current) => ({ ...current, phone: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm outline-none"
                  />
                </label>
                <label className="rounded-2xl bg-amber-50 p-3 block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">{t('settings.staff_modal.role')}</span>
                  <select
                    value={staffForm.role}
                    onChange={(event) =>
                      setStaffForm((current) => ({ ...current, role: event.target.value as AppRole }))
                    }
                    className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm outline-none"
                  >
                    <option value="cashier">{t('settings.roles.cashier')}</option>
                    <option value="manager">{t('settings.roles.manager')}</option>
                    {(profile?.role === 'super_admin' || profile?.role === 'admin') && <option value="admin">{t('settings.roles.admin')}</option>}
                  </select>
                </label>
                <div className="rounded-2xl bg-cyan-50 p-3 block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">{t('settings.staff_modal.branches')}</span>
                  <p className="text-[10px] text-cyan-600 mt-1 mb-3">{t('settings.staff_modal.branches_desc')}</p>
                  <div className="flex flex-wrap gap-2">
                    {locations.map(loc => {
                      const isActive = staffForm.assignedLocationIds.includes(loc.id);
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() =>
                            setStaffForm((current) => ({
                              ...current,
                              assignedLocationIds: isActive 
                                ? current.assignedLocationIds.filter(id => id !== loc.id)
                                : [...current.assignedLocationIds, loc.id]
                            }))
                          }
                          className={`rounded-xl px-4 py-2 text-xs font-bold transition flex items-center gap-2 border ${
                            isActive 
                              ? "bg-brand-500 text-white border-brand-500 shadow-sm" 
                              : "bg-white text-slate-500 border-slate-200 hover:border-brand-300"
                          }`}
                        >
                          <MapPin size={12} className={isActive ? "text-brand-200" : "text-slate-300"} />
                          {loc.name}
                        </button>
                      );
                    })}
                  </div>
                  {staffForm.assignedLocationIds.length === 0 && (
                    <p className="mt-2 text-[10px] font-bold text-rose-500 flex items-center gap-1">
                      <X size={10} />
                      {t('settings.staff_modal.branch_warning')}
                    </p>
                  )}
                </div>
                {!editingStaffId ? (
                  <label className="rounded-2xl bg-violet-50 p-3 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">{t('common.password')}</span>
                    <input
                      type="password"
                      value={staffForm.password}
                      onChange={(event) => setStaffForm((current) => ({ ...current, password: event.target.value }))}
                      className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm outline-none"
                    />
                  </label>
                ) : null}
              </div>

              <div className="rounded-3xl border border-brand-100 bg-brand-50/50 p-4">
                <div className="mb-4 flex items-center gap-3">
                  <ShieldCheck size={18} className="text-brand-600" />
                  <div>
                    <p className="text-sm font-semibold text-ink">{t('settings.staff_modal.permissions_title')}</p>
                    <p className="text-sm text-slate-500">
                      {staffForm.role === 'admin' 
                        ? t('settings.staff_modal.admin_permissions_desc') 
                        : t('settings.staff_modal.staff_permissions_desc')}
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white">
                  <div className="grid grid-cols-[1.2fr_repeat(4,0.55fr)] bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                    <span>{t('settings.staff_modal.col_module')}</span>
                    <span>{t('settings.staff_modal.col_view')}</span>
                    <span>{t('settings.staff_modal.col_add')}</span>
                    <span>{t('settings.staff_modal.col_edit')}</span>
                    <span>{t('settings.staff_modal.col_delete')}</span>
                  </div>
                  {permissionRows.map((permission) => (
                    <div key={permission.module} className="grid grid-cols-[1.2fr_repeat(4,0.55fr)] items-center border-t border-slate-100 px-4 py-3 text-sm">
                      <span className="font-semibold text-ink">{permission.module}</span>
                      {(["view", "add", "edit", "remove"] as const).map((key) => (
                        <label key={key} className="flex justify-center">
                          <input
                            type="checkbox"
                            checked={permission[key]}
                            disabled={staffForm.role === "admin"}
                            onChange={() => togglePermission(permission.module, key)}
                            className={`h-4 w-4 rounded border-slate-300 ${staffForm.role === "admin" ? "opacity-50 cursor-not-allowed" : ""}`}
                          />
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button
                onClick={() => setStaffModalOpen(false)}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={saveStaffAccount}
                disabled={savingStaff}
                className="rounded-2xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingStaff ? t('common.saving') : t('settings.staff_modal.save_btn')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* Reset Password Modal */}
      {resetPasswordStaff && (
        <ResetPasswordModal
          staff={resetPasswordStaff}
          onClose={() => setResetPasswordStaff(null)}
        />
      )}
    </div>
  );
}

function ResetPasswordModal({ staff, onClose }: { staff: StaffAccount; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const { showToast } = useNotification();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      showToast("warning", "Password must be at least 6 characters long.");
      return;
    }

    setIsUpdating(true);
    try {
      if (!staff.auth_user_id) {
        throw new Error("Staff member has no linked auth account.");
      }
      await resetStaffPassword(staff.auth_user_id, password);
      showToast("success", "Password updated successfully!");
      onClose();
    } catch (err: any) {
      showToast("error", err.message || "Failed to update password");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-bold text-ink">{t('settings.reset_modal.title')}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        
        <p className="mb-6 text-sm text-slate-500">
          {t('settings.reset_modal.desc', { name: staff.fullName })}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('settings.reset_modal.new_pw')}
            </label>
            <input
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-brand-300"
              placeholder="••••••••"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl bg-slate-100 py-3 font-semibold text-slate-600 transition hover:bg-slate-200"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isUpdating}
              className="flex-1 rounded-2xl bg-brand-500 py-3 font-semibold text-white shadow-soft transition hover:bg-brand-600 disabled:opacity-50"
            >
              {isUpdating ? t('common.updating') : t('common.update')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
