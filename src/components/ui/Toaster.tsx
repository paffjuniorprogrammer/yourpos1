import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { useNotification, ToastType } from "../../context/NotificationContext";

const toastStyles: Record<ToastType, string> = {
  success: "bg-emerald-50 border-emerald-100 text-emerald-800 shadow-emerald-100/50",
  error: "bg-rose-50 border-rose-100 text-rose-800 shadow-rose-100/50",
  warning: "bg-amber-50 border-amber-100 text-amber-800 shadow-amber-100/50",
  info: "bg-sky-50 border-sky-100 text-sky-800 shadow-sky-100/50",
};

const toastIcons = {
  success: <CheckCircle className="text-emerald-500" size={20} />,
  error: <AlertCircle className="text-rose-500" size={20} />,
  warning: <AlertTriangle className="text-amber-500" size={20} />,
  info: <Info className="text-sky-500" size={20} />,
};

export function Toaster() {
  const { toasts, hideToast } = useNotification();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col items-end gap-2.5 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex w-full max-w-sm animate-in slide-in-from-right-6 fade-in duration-200 items-start gap-3 rounded-2xl border p-3.5 shadow-2xl backdrop-blur-md ${toastStyles[toast.type]}`}
        >
          <div className="flex-shrink-0 mt-0.5">
            {toastIcons[toast.type]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold leading-relaxed">
              {toast.message}
            </p>
          </div>
          <button
            onClick={() => hideToast(toast.id)}
            className="flex-shrink-0 rounded-lg p-1 transition hover:bg-black/10"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
