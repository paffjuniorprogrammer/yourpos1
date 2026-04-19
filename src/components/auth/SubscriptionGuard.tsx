import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LoadingPOS } from '../ui/LoadingPOS';

export const SubscriptionGuard: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isSubscriptionActive, profile, loading } = useAuth();

  if (loading) {
    return <LoadingPOS />;
  }

  // Super admins bypass subscription checks
  if (profile?.role === 'super_admin') {
    return children ? <>{children}</> : <Outlet />;
  }

  if (!isSubscriptionActive) {
    return <Navigate to="/subscription-expired" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export const SuperAdminGuard: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { profile, loading } = useAuth();

  if (loading) {
    return <LoadingPOS />;
  }

  if (profile?.role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
