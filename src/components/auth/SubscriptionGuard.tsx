import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LoadingPOS } from '../ui/LoadingPOS';

export const SubscriptionGuard: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isSubscriptionActive, profile, loading, isDemoMode } = useAuth();
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const online = () => setIsOffline(false);
    const offline = () => setIsOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);

  if (loading && !isOffline) {
    return <LoadingPOS />;
  }

  // Super admins bypass subscription checks
  if (profile?.role === 'super_admin') {
    return children ? <>{children}</> : <Outlet />;
  }

  // Demo mode bypasses subscription checks — demo business has no real subscription
  if (isDemoMode) {
    return children ? <>{children}</> : <Outlet />;
  }

  // Network loss must not lock out an otherwise active account. Explicitly
  // expired or suspended accounts remain blocked using the cached profile.
  const cachedBusiness = profile?.business;
  const cachedExplicitlyBlocked = cachedBusiness?.status === 'suspended' ||
    (cachedBusiness?.subscription_end_date && new Date(cachedBusiness.subscription_end_date).getTime() < Date.now());
  if (!isSubscriptionActive && !(isOffline && !cachedExplicitlyBlocked)) {
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
