import Link from 'next/link';
import { Wordmark } from '@/components/ui/wordmark';

const LINKS = [
  { href: '/how-it-works', label: 'Comment ça marche' },
  { href: '/help', label: 'Aide' },
  { href: '/find-tickets', label: 'Retrouver mon billet' },
];

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-bg py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 sm:flex-row sm:justify-between sm:px-10">
        <Wordmark />
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-[13px] font-semibold text-text-muted hover:text-text">
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="text-[12px] font-semibold text-text-muted">© {new Date().getFullYear()} Zen Events</span>
      </div>
    </footer>
  );
}
