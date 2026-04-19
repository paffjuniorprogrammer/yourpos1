import React from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }: ConfirmModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300"
      onClick={onCancel}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
      
      {/* Modal Content */}
      <div 
        className="relative w-full max-w-md scale-100 transform overflow-hidden rounded-[2.5rem] border border-white/20 bg-white/90 p-8 shadow-2xl backdrop-blur-xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-50 text-rose-600 shadow-inner">
            <AlertCircle size={32} />
          </div>
          
          <h3 className="mb-3 text-2xl font-black tracking-tight text-slate-900">
            {title}
          </h3>
          
          <p className="mb-8 text-sm leading-relaxed text-slate-500">
            {message}
          </p>
          
          <div className="flex w-full gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-2xl border border-slate-200 bg-white py-4 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 hover:shadow-md active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 rounded-2xl bg-rose-600 py-4 text-sm font-bold text-white shadow-lg shadow-rose-200 transition-all hover:bg-rose-700 hover:shadow-rose-300 active:scale-95"
            >
              Confirm
            </button>
          </div>
        </div>
        
        {/* Close Button */}
        <button 
          onClick={onCancel}
          className="absolute right-6 top-6 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={20} />
        </button>
      </div>
    </div>,
    document.body
  );
}
