'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { XCloseIcon } from '@/components/ui/icons';
import { buttonClasses } from '@/components/ui/button';
import { useOverlayBehavior } from '@/hooks/use-overlay-behavior';
import { formatXof, cn } from '@/lib/utils';
import { serializeCartItems } from '@/lib/cart';
import { TicketTypeRow } from './ticket-type-row';
import type { PublicTicketType } from '@/types';

interface TicketSidesheetProps {
  open: boolean;
  onClose: () => void;
  ticketTypes: PublicTicketType[];
  eventSlug: string;
}

// Slides in from the right rather than centered like Modal, but reuses the
// same overlay/focus/Escape/scroll-lock behavior (useOverlayBehavior) —
// see components/ui/modal.tsx for the primitive this was extracted from.
export function TicketSidesheet({ open, onClose, ticketTypes, eventSlug }: TicketSidesheetProps) {
  useOverlayBehavior(open, onClose);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) setQuantities({});
  }, [open]);

  if (typeof document === 'undefined') return null;

  const total = ticketTypes.reduce((sum, tt) => sum + (quantities[tt.id] ?? 0) * tt.displayPrice, 0);
  const totalQuantity = Object.values(quantities).reduce((sum, q) => sum + q, 0);
  const cartItems = Object.entries(quantities).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
  const checkoutHref = `/checkout?event=${encodeURIComponent(eventSlug)}&items=${encodeURIComponent(serializeCartItems(cartItems))}`;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* z-[1100]: Leaflet's own panes/controls stack up to ~z-1000
              (same reasoning as the z-[1001] dropdown in
              event-location-picker.tsx) — the Adresse section's map would
              otherwise render above the sidesheet at the default z-50. */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1100] bg-overlay"
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-y-0 right-0 z-[1100] flex w-full max-w-[440px] flex-col bg-card"
            role="dialog"
            aria-modal="true"
            aria-label="Choix des billets"
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <h2 className="text-[13px] font-extrabold uppercase tracking-wide">Choisir des billets</h2>
              <button
                type="button"
                aria-label="Fermer"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded text-text-muted hover:bg-bg"
              >
                <XCloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6">
              {ticketTypes.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-text-muted">
                  Aucun billet disponible pour le moment.
                </p>
              ) : (
                ticketTypes.map((ticketType) => (
                  <TicketTypeRow
                    key={ticketType.id}
                    ticketType={ticketType}
                    quantity={quantities[ticketType.id] ?? 0}
                    onChange={(quantity) => setQuantities((prev) => ({ ...prev, [ticketType.id]: quantity }))}
                  />
                ))
              )}
            </div>

            <div className="border-t border-border px-6 py-5">
              <div className="mb-4 flex items-center justify-between text-[15px] font-extrabold">
                <span>Total</span>
                <span>{formatXof(total)}</span>
              </div>
              <Link
                href={checkoutHref}
                aria-disabled={totalQuantity === 0}
                onClick={(e) => {
                  if (totalQuantity === 0) e.preventDefault();
                }}
                className={cn(buttonClasses('primary'), 'w-full justify-center', totalQuantity === 0 && 'pointer-events-none opacity-40')}
              >
                Continuer
              </Link>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
