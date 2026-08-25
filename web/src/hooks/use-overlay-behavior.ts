'use client';

import { useEffect } from 'react';

// Shared by Modal and the ticket sidesheet — Escape-to-close plus a
// background scroll lock, so any full-screen overlay in the app behaves the
// same way rather than each one reimplementing this from scratch.
export function useOverlayBehavior(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);
}
