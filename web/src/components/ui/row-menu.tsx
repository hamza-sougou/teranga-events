'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { MoreVerticalIcon } from './icons';

interface RowMenuItem {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}

// Contextual per-row menu (kebab trigger) — for actions that shouldn't be
// permanently visible in every row, unlike the direct icon buttons used in
// e.g. ticket-types-panel.tsx. Same outside-click/Escape-to-close pattern as
// CategorySelect, inline-positioned rather than a portal since it's anchored
// to its row, not a page-level overlay like Modal.
export function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-label="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg"
      >
        <MoreVerticalIcon className="h-4 w-4" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-10 mt-1.5 w-[200px] rounded border-[1.5px] border-border bg-card py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={cn(
                'block w-full px-3.5 py-2 text-left text-[13px] font-semibold hover:bg-bg',
                item.tone === 'danger' ? 'text-danger' : 'text-text',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
