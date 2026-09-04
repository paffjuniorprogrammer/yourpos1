import { Route, Routes, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AppShell } from "./components/layout/AppShell";
import { CustomersPage } from "./pages/CustomersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PosPage } from "./pages/PosPage";
import { BarPosPage } from "./pages/BarPosPage";
import { RoomsPage } from "./pages/RoomsPage";
import { TablesPage } from "./pages/TablesPage";
import { GuestOrderPage } from "./pages/GuestOrderPage";
import { ProductsPage } from "./pages/ProductsPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { PurchaseRequisitionPage } from "./pages/PurchaseRequisitionPage";
import { ReportsPage } from "./pages/ReportsPage";
import { VatReportPage } from "./pages/VatReportPage";
import { SalesPage } from "./pages/SalesPage";
import { StockLossExpensePage } from "./pages/StockLossExpensePage";
import { SettingsPage } from "./pages/SettingsPage";
import { StockPage } from "./pages/StockPage";
import { TransfersPage } from "./pages/TransfersPage";
import { AddPurchasePage } from "./pages/AddPurchasePage";
import { AddStockCountPage } from "./pages/AddStockCountPage";
import { AddRequisitionPage } from "./pages/AddRequisitionPage";
import { AddProductPage } from "./pages/AddProductPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { PWAInstallPrompt } from "./components/ui/PWAInstallPrompt";
import { Toaster } from "./components/ui/Toaster";
import { ConnectionStatus } from "./components/ui/ConnectionStatus";
import { SubscriptionGuard, SuperAdminGuard } from "./components/auth/SubscriptionGuard";
import { SuperAdminDashboard } from "./pages/SuperAdminDashboard";
import { SuperAdminShell } from "./components/layout/SuperAdminShell";
import { 
  BusinessesPage,
  SubscriptionsPage
} from "./pages/super-admin/ModulePages";
import { GlobalUsersPage } from "./pages/super-admin/GlobalUsersPage";
import { SubscriptionBillingPage } from "./pages/SubscriptionBillingPage";
import { SubscriptionExpiredPage } from "./pages/SubscriptionExpiredPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";

export default function App() {
  const location = useLocation();
  const isPublicPage = ["/", "/home", "/login"].includes(location.pathname);

  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/guest-order/:kind/:token" element={<GuestOrderPage />} />
        
        {/* Regular POS Tenant Routes */}
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route
            path="/subscription"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <SubscriptionBillingPage />
              </ProtectedRoute>
            }
          />
          <Route element={<SubscriptionGuard />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route
              path="/pos"
              element={
                <ProtectedRoute requiredPermission={["POS", "view"]}>
                  <PosPage />
                </ProtectedRoute>
              }
            />
            {/* ---- Guest House & Bar Routes ---- */}
            <Route
              path="/bar-pos"
              element={
                <ProtectedRoute requiredPermission={["Bar POS", "view"]}>
                  <BarPosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rooms"
              element={
                <ProtectedRoute requiredPermission={["Rooms", "view"]}>
                  <RoomsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tables"
              element={
                <ProtectedRoute requiredPermission={["Tables", "view"]}>
                  <TablesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ProtectedRoute requiredPermission={["Products", "view"]}>
                  <ProductsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales"
              element={
                <ProtectedRoute requiredPermission={["Sales", "view"]}>
                  <SalesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock-loss"
              element={
                <ProtectedRoute requiredPermission={["Stock Loss", "view"]}>
                  <StockLossExpensePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/purchases"
              element={
                <ProtectedRoute requiredPermission={["Purchases", "view"]}>
                  <PurchasesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/purchases/new"
              element={
                <ProtectedRoute requiredPermission={["Purchases", "add"]}>
                  <AddPurchasePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/requisitions"
              element={
                <ProtectedRoute requiredPermission={["Requisitions", "view"]}>
                  <PurchaseRequisitionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/requisitions/new"
              element={
                <ProtectedRoute requiredPermission={["Requisitions", "add"]}>
                  <AddRequisitionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/requisitions/edit/:id"
              element={
                <ProtectedRoute requiredPermission={["Requisitions", "add"]}>
                  <AddRequisitionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products/new"
              element={
                <ProtectedRoute requiredPermission={["Products", "add"]}>
                  <AddProductPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products/edit/:id"
              element={
                <ProtectedRoute requiredPermission={["Products", "edit"]}>
                  <AddProductPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers"
              element={
                <ProtectedRoute requiredPermission={["Customers", "view"]}>
                  <CustomersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/suppliers"
              element={
                <ProtectedRoute requiredPermission={["Suppliers", "view"]}>
                  <SuppliersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock"
              element={
                <ProtectedRoute requiredPermission={["Stock", "view"]}>
                  <StockPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/transfers"
              element={
                <ProtectedRoute requiredPermission={["Transfers", "view"]}>
                  <TransfersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock/new-count"
              element={
                <ProtectedRoute requiredPermission={["Stock", "add"]}>
                  <AddStockCountPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute requiredPermission={["Reports", "view"]}>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vat-report"
              element={
                <ProtectedRoute requiredPermission={["Reports", "view"]}>
                  <VatReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
          </Route>
        </Route>

        {/* Super Admin Command Center Routes */}
        <Route
          path="/super-admin"
          element={
            <SuperAdminGuard>
              <SuperAdminShell />
            </SuperAdminGuard>
          }
        >
          <Route index element={<SuperAdminDashboard />} />
          <Route path="businesses" element={<BusinessesPage />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
        </Route>
        
        {/* Public Error / Status Pages */}
        <Route path="/subscription-expired" element={<SubscriptionExpiredPage />} />
      </Routes>
      <Toaster />
      {!isPublicPage ? <ConnectionStatus /> : null}
      {!isPublicPage ? <PWAInstallPrompt /> : null}
    </>
  );
}
