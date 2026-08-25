'use client';

import { createPortal } from 'react-dom';
import { XCloseIcon } from '@/components/ui/icons';
import { useOverlayBehavior } from '@/hooks/use-overlay-behavior';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  useOverlayBehavior(open, onClose);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-[520px] overflow-y-auto rounded-card border-[1.5px] border-border bg-card p-[22px]">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-[13px] font-extrabold uppercase tracking-wide">{title}</h3>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg"
          >
            <XCloseIcon className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
