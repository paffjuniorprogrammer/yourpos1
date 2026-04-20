import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { AppShell } from "./components/layout/AppShell";
import { CustomersPage } from "./pages/CustomersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PosPage } from "./pages/PosPage";
import { ProductsPage } from "./pages/ProductsPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SalesPage } from "./pages/SalesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StockPage } from "./pages/StockPage";
import { SuppliersPage } from "./pages/SuppliersPage";
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

export default function App() {
  const { profile } = useAuth();
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
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
          <Route index element={
            profile?.role === 'super_admin' 
              ? <Navigate to="/super-admin" replace /> 
              : <Navigate to="/dashboard" replace />
          } />
          <Route path="/dashboard" element={<DashboardPage />} />
            <Route
              path="/pos"
              element={
                <ProtectedRoute requiredPermission={["POS", "view"]}>
                  <PosPage />
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
              path="/purchases"
              element={
                <ProtectedRoute requiredPermission={["Purchases", "view"]}>
                  <PurchasesPage />
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
              path="/reports"
              element={
                <ProtectedRoute requiredPermission={["Reports", "view"]}>
                  <ReportsPage />
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
      <ConnectionStatus />
    </>
  );
}
