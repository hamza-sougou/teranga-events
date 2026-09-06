'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRightIcon } from '@/components/ui/icons';

export interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

// Ouverture multiple indépendante (pas un seul panneau à la fois, contrairement
// à RowMenu) — une FAQ se compare, plusieurs réponses peuvent être ouvertes en
// même temps. Contenu inline qui pousse la page, pas un panneau flottant : pas
// de fermeture au clic extérieur/Échap façon RowMenu, ça n'a pas de sens ici.
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());

  function toggle(index: number) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => {
        const open = openIds.has(index);
        return (
          <div key={item.question} className="rounded-card border-[1.5px] border-border bg-card">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(index)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left text-[14px] font-bold text-text"
            >
              {item.question}
              <ChevronRightIcon
                className={cn('h-4 w-4 shrink-0 text-text-muted transition-transform', open && 'rotate-90')}
              />
            </button>
            {open && <div className="px-4 pb-4 text-[13px] text-text-muted">{item.answer}</div>}
          </div>
        );
      })}
    </div>
  );
}
