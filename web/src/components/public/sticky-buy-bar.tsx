'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { formatXof } from '@/lib/utils';

interface StickyBuyBarProps {
  visible: boolean;
  eventName: string;
  fromPrice: number | null;
  onBuyClick: () => void;
}

// Appears once the visitor has scrolled past the hero, so buying stays
// reachable through a long description without scrolling back to the top.
export function StickyBuyBar({ visible, eventName, fromPrice, onBuyClick }: StickyBuyBarProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -64, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -64, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-x-0 top-0 z-40 border-b-[1.5px] border-border bg-card"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
            <span className="truncate text-[13px] font-extrabold uppercase tracking-wide">{eventName}</span>
            <div className="flex items-center gap-4">
              {fromPrice != null && (
                <span className="hidden text-[13px] font-semibold text-text-muted sm:inline">
                  À partir de {formatXof(fromPrice)}
                </span>
              )}
              <Button onClick={onBuyClick}>Obtenir des tickets</Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
