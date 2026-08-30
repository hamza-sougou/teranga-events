import Link from 'next/link';
import { ArrowLeftIcon } from '@/components/ui/icons';

// Standalone circular icon button — the checkout flow has no navbar to fall
// back on for "how do I leave", so this is the one way back on both
// /checkout and /checkout/confirmation.
export function BackButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Retour"
      className="flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-border bg-card text-text transition-colors hover:bg-bg"
    >
      <ArrowLeftIcon className="h-4 w-4" />
    </Link>
  );
}
