'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useOverlayBehavior } from '@/hooks/use-overlay-behavior';
import { logout } from '@/lib/auth';
import { Wordmark } from '@/components/ui/wordmark';
import { Avatar } from '@/components/ui/avatar';
import { buttonClasses } from '@/components/ui/button';
import { RowMenu } from '@/components/ui/row-menu';
import { MenuIcon, XCloseIcon } from '@/components/ui/icons';

const INFO_LINKS = [
  { href: '/how-it-works', label: 'Comment ça marche' },
  { href: '/help', label: 'Aide' },
  { href: '/find-tickets', label: 'Retrouver mon billet' },
];

const linkClasses = 'text-[13px] font-semibold text-text-muted transition-colors hover:text-text';

// Always rendered — unlike PublicNavbarCategories below it, this tier has no
// hide-on-scroll mechanism. It's a static (non-sticky) header on purpose: the
// event detail page's StickyBuyBar is `fixed top-0`, and keeping this header
// out of the fixed-position layer avoids the two ever fighting for the same
// pixels while scrolling.
export function PublicNavbarTop() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isLoading, activeMembership } = useCurrentUser();
  const router = useRouter();

  return (
    <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:px-10">
      <Wordmark />

      <nav className="hidden items-center gap-6 lg:flex">
        {INFO_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={linkClasses}>
            {link.label}
          </Link>
        ))}

        <div className="h-5 w-px bg-border" />

        {!isLoading && (
          activeMembership ? (
            <RowMenu
              items={[
                { label: 'Tableau de bord', onClick: () => router.push('/dashboard') },
                { label: 'Se déconnecter', tone: 'danger', onClick: logout },
              ]}
              trigger={({ toggle }) => (
                <button
                  type="button"
                  aria-label="Menu du compte"
                  aria-haspopup="menu"
                  onClick={toggle}
                  className="flex items-center gap-2.5 rounded px-1.5 py-1 transition-colors hover:bg-bg"
                >
                  <Avatar name={activeMembership.organization.name} tone="indigo" size={30} />
                  <span className="text-[13px] font-bold text-text">{activeMembership.organization.name}</span>
                </button>
              )}
            />
          ) : (
            <>
              <Link href="/login" className={buttonClasses('primary')}>
                Espace organisateur
              </Link>
            </>
          )
        )}
      </nav>

      <button
        type="button"
        aria-label="Ouvrir le menu"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded text-text lg:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        isLoading={isLoading}
        activeMembership={activeMembership}
      />
    </div>
  );
}

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  isLoading: boolean;
  activeMembership: ReturnType<typeof useCurrentUser>['activeMembership'];
}

// Same portal + backdrop + useOverlayBehavior recipe as Modal/TicketSidesheet
// (components/ui/modal.tsx, components/public/ticket-sidesheet.tsx).
// z-[1100]: same reasoning as the sidesheet — stays above Leaflet's own
// panes/controls (~z-1000) on the event detail page's Adresse section.
function MobileMenu({ open, onClose, isLoading, activeMembership }: MobileMenuProps) {
  useOverlayBehavior(open, onClose);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1100] bg-overlay"
            onClick={onClose}
          />
          <motion.div
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-y-0 right-0 z-[1100] flex w-full max-w-[320px] flex-col bg-card"
            role="menu"
            aria-label="Menu"
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <Wordmark />
              <button
                type="button"
                aria-label="Fermer"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded text-text-muted hover:bg-bg"
              >
                <XCloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1 px-3 py-4">
              {INFO_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  className="rounded px-3 py-2.5 text-[14px] font-semibold text-text hover:bg-bg"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="mt-auto border-t border-border px-3 py-4">
              {!isLoading && (
                activeMembership ? (
                  <>
                    <Link
                      href="/dashboard"
                      onClick={onClose}
                      className="flex items-center gap-2.5 rounded px-3 py-2.5 hover:bg-bg"
                    >
                      <Avatar name={activeMembership.organization.name} tone="indigo" size={32} />
                      <span className="text-[13px] font-bold text-text">{activeMembership.organization.name}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        logout();
                      }}
                      className="mt-1 rounded px-3 py-2.5 text-left text-[14px] font-semibold text-danger hover:bg-bg"
                    >
                      Se déconnecter
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2 px-3">
                    <Link href="/login" onClick={onClose} className="text-[14px] font-semibold text-text-muted">
                      Je suis organisateur
                    </Link>
                    <Link
                      href="/register"
                      onClick={onClose}
                      className={buttonClasses('primary', 'w-full justify-center')}
                    >
                      Se connecter / S&apos;inscrire
                    </Link>
                  </div>
                )
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
