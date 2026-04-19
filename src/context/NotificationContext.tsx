import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ConfirmModal } from '../components/ui/ConfirmModal';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface NotificationContextType {
  toasts: Toast[];
  showToast: (type: ToastType, message: string) => void;
  hideToast: (id: string) => void;
  confirm: (title: string, message: string) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const hideToast = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((current) => [...current, { id, type, message }]);

    // Auto-hide after 5 seconds
    setTimeout(() => {
      hideToast(id);
    }, 5000);
  }, [hideToast]);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback((title: string, message: string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        isOpen: true,
        title,
        message,
        resolve,
      });
    });
  }, []);

  const handleConfirm = () => {
    if (confirmState) {
      confirmState.resolve(true);
      setConfirmState(null);
    }
  };

  const handleCancel = () => {
    if (confirmState) {
      confirmState.resolve(false);
      setConfirmState(null);
    }
  };

  return (
    <NotificationContext.Provider value={{ toasts, showToast, hideToast, confirm }}>
      {children}
      {confirmState && (
        <ConfirmModal
          isOpen={confirmState.isOpen}
          title={confirmState.title}
          message={confirmState.message}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
