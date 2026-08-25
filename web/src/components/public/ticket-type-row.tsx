import { MinusIcon, PlusIcon } from '@/components/ui/icons';
import { TicketCategoryTag } from '@/components/ui/category-tag';
import { formatXof } from '@/lib/utils';
import type { PublicTicketType } from '@/types';

interface TicketTypeRowProps {
  ticketType: PublicTicketType;
  quantity: number;
  onChange: (quantity: number) => void;
}

function unavailableReason(ticketType: PublicTicketType): string | null {
  if (ticketType.available <= 0) return 'Épuisé';
  if (!ticketType.isOnSale) {
    return Date.now() < new Date(ticketType.saleStart).getTime() ? 'Bientôt en vente' : 'Vente terminée';
  }
  return null;
}

export function TicketTypeRow({ ticketType, quantity, onChange }: TicketTypeRowProps) {
  const reason = unavailableReason(ticketType);
  const purchasable = reason === null;
  const maxQuantity = Math.min(ticketType.maxPerOrder, ticketType.available);

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center gap-2">
          <TicketCategoryTag category={ticketType.category} />
          {reason && <span className="text-[11px] font-bold text-text-muted">{reason}</span>}
        </div>
        <div className="font-bold text-text">{ticketType.name}</div>
        <div className="text-[13px] font-semibold text-text-muted">{formatXof(ticketType.displayPrice)}</div>
      </div>

      {purchasable && (
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            aria-label="Diminuer la quantité"
            onClick={() => onChange(Math.max(0, quantity - 1))}
            disabled={quantity === 0}
            className="flex h-7 w-7 items-center justify-center rounded border border-border text-text hover:bg-bg disabled:opacity-30"
          >
            <MinusIcon className="h-3.5 w-3.5" />
          </button>
          <span className="w-4 text-center text-[13px] font-bold tabular-nums">{quantity}</span>
          <button
            type="button"
            aria-label="Augmenter la quantité"
            onClick={() => onChange(Math.min(maxQuantity, quantity + 1))}
            disabled={quantity >= maxQuantity}
            className="flex h-7 w-7 items-center justify-center rounded border border-border text-text hover:bg-bg disabled:opacity-30"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
