import Link from 'next/link';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { buttonClasses } from '@/components/ui/button';
import { formatXof, cn } from '@/lib/utils';
import type { PublicEvent, PublicTicketType } from '@/types';

interface OrderLine {
  ticketType: PublicTicketType;
  quantity: number;
}

interface CheckoutPreview {
  subtotalAmount: number;
  serviceFeeAmount: number;
  totalAmount: number;
}

interface OrderSummaryPanelProps {
  event: PublicEvent;
  eventSlug: string;
  lines: OrderLine[];
  preview: CheckoutPreview | undefined;
}

// Its own card rather than the generic Panel primitive — Panel assumes one
// padded content area, but this needs an edge-to-edge image and an
// edge-to-edge contrasted total band bookending padded sections in between
// (same reasoning EventCard/TicketSidesheet already build bespoke
// containers instead of forcing Panel to fit).
export function OrderSummaryPanel({ event, eventSlug, lines, preview }: OrderSummaryPanelProps) {
  const coverUrl = event.media.find((item) => item.type === 'IMAGE')?.url ?? null;
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.ticketType.displayPrice, 0);
  const formattedDate = format(new Date(event.startAt), "d MMMM yyyy 'à' HH:mm", { locale: fr });

  return (
    <div className="overflow-hidden rounded-card border-[1.5px] border-border bg-card">
      <div className="relative h-[180px] w-full bg-ink-2">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={event.name} className="h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-overlay" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h2 className="text-lg font-black leading-tight text-white">{event.name}</h2>
        </div>
      </div>

      <div className="p-5">
        <p className="text-[13px] font-semibold text-text">{formattedDate}</p>
        <p className="mt-1 text-[13px] font-semibold text-text-muted">
          {totalQuantity} billet{totalQuantity > 1 ? 's' : ''}
        </p>

        <Link href={`/events/${eventSlug}`} className={cn(buttonClasses('ghost'), 'mt-4 w-full justify-center')}>
          Modifier mon achat
        </Link>

        <div className="mt-5 border-t border-border pt-4">
          {lines.map((line) => (
            <div key={line.ticketType.id} className="flex items-center justify-between py-1.5 text-[13px]">
              <span className="font-semibold text-text">
                {line.quantity}× {line.ticketType.name}
              </span>
              <span className="font-semibold text-text-muted">
                {formatXof(line.quantity * line.ticketType.displayPrice)}
              </span>
            </div>
          ))}

          {preview && (
            <>
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[13px]">
                <span className="text-text-muted">Sous-total</span>
                <span className="font-semibold text-text">{formatXof(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-[13px]">
                <span className="text-text-muted">Frais de service</span>
                <span className="font-semibold text-text">{formatXof(preview.serviceFeeAmount)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {preview && (
        <div className="flex items-center justify-between rounded-b-card bg-ink px-5 py-4 text-white">
          <span className="text-[13px] font-bold uppercase tracking-wide">Total à payer</span>
          <span className="text-[17px] font-extrabold">{formatXof(preview.totalAmount)}</span>
        </div>
      )}
    </div>
  );
}
