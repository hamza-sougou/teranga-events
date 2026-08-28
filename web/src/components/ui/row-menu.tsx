'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { MoreVerticalIcon } from './icons';

interface RowMenuItem {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}

interface RowMenuProps {
  items: RowMenuItem[];
  // Default is the kebab icon button (team page). A custom trigger lets a
  // caller turn its own element (e.g. an account/org identity block) into
  // the menu's toggle instead — the caller owns the trigger's markup/style,
  // it just wires `toggle` to its own onClick.
  trigger?: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  // 'bottom' (default, unchanged) opens below-right of the trigger — fine
  // for a table row. 'top' opens above-left instead, for a trigger pinned
  // near the bottom of the viewport (e.g. a sidebar footer) where a
  // downward menu would run off-screen.
  placement?: 'top' | 'bottom';
}

// Contextual dropdown menu — for actions that shouldn't be permanently
// visible, unlike the direct icon buttons used in e.g. ticket-types-panel.tsx.
// Same outside-click/Escape-to-close pattern as CategorySelect, inline-
// positioned rather than a portal since it's anchored to its trigger, not a
// page-level overlay like Modal.
export function RowMenu({ items, trigger, placement = 'bottom' }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggle = () => setOpen((o) => !o);

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
      {trigger ? (
        trigger({ open, toggle })
      ) : (
        <button
          type="button"
          aria-label="Actions"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggle}
          className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg"
        >
          <MoreVerticalIcon className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-10 w-[200px] rounded border-[1.5px] border-border bg-card py-1 shadow-lg',
            placement === 'top' ? 'bottom-full left-0 mb-1.5' : 'right-0 top-full mt-1.5',
          )}
        >
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
