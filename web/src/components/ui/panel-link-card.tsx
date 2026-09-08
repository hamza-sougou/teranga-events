import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ChevronRightIcon } from '@/components/ui/icons';

interface PanelLinkCardProps {
  href: string;
  title: string;
  value: React.ReactNode;
  subLabel?: string;
  subValue?: React.ReactNode;
  className?: string;
}

// Same shape/spacing as Panel (rounded-card border bg-card p-[22px] mb-[18px])
// but the whole card is a link — used where a full panel would be too heavy
// for a sidebar column (see events/[id]/page.tsx "Ventes"/"Historique de
// scan" cards, linking out to their own dedicated pages).
export function PanelLinkCard({ href, title, value, subLabel, subValue, className }: PanelLinkCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        'mb-[18px] flex items-center justify-between rounded-card border-[1.5px] border-border bg-card p-[22px] transition-colors hover:bg-bg',
        className,
      )}
    >
      <div>
        <h3 className="mb-1.5 text-[13px] font-extrabold uppercase tracking-wide">{title}</h3>
        <p className="text-[22px] font-black leading-none">{value}</p>
        {subLabel && subValue && (
          <p className="mt-1.5 text-[11px] text-text-muted">
            {subLabel} {subValue}
          </p>
        )}
      </div>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-muted" />
    </Link>
  );
}
