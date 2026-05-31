import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { AppRole } from "../../types/database";
import { LoadingPOS } from "../ui/LoadingPOS";

type ProtectedRouteProps = {
  children: ReactNode;
  allowedRoles?: AppRole[];
  requiredPermission?: [string, "view" | "add" | "edit" | "delete"];
};

export function ProtectedRoute({ children, allowedRoles, requiredPermission }: ProtectedRouteProps) {
  const { authConfigured, hasRole, can, loading, profile, session } = useAuth();
  const location = useLocation();

  if (!authConfigured) {
    return <>{children}</>;
  }

  if (loading) {
    return <LoadingPOS />;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Super Admin bypasses all role and permission checks
  if (profile?.role === 'super_admin') {
    return <>{children}</>;
  }

  // Role check
  const roleOk = !allowedRoles?.length || (profile && hasRole(...allowedRoles));
  
  // Permission check (if provided, it must also pass)
  const permissionOk = !requiredPermission || can(requiredPermission[0], requiredPermission[1]);

  if (!roleOk || !permissionOk) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
