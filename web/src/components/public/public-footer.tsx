'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@iconify/react/offline';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { CATEGORY_ICONS } from '@/lib/category-icons';
import { Wordmark } from '@/components/ui/wordmark';
import { FacebookIcon, InstagramIcon } from '@/components/ui/icons';
import type { EventCategory } from '@/types';

const columnTitleClasses = 'mb-3 text-[12px] font-bold uppercase tracking-wide text-on-dark-muted';
const linkClasses = 'text-[13px] font-semibold text-on-dark-muted transition-colors hover:text-on-dark';

const ORGANIZER_LINKS = [
  { href: '/register', label: 'Devenez organisateur' },
  { href: '/how-it-works', label: 'Comment ça marche' },
  { href: '/pricing', label: 'Tarifs' },
];

const HELP_LINKS = [
  { href: '/help', label: 'Aide' },
  { href: '/find-tickets', label: 'Retrouver mon billet' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
  { href: '/refunds', label: 'Remboursements' },
];

const LEGAL_LINKS = [
  { href: '/legal-notice', label: 'Mentions légales' },
  { href: '/terms', label: 'CGU' },
  { href: '/terms-of-sale', label: 'CGV' },
  { href: '/privacy', label: 'Confidentialité' },
];

const COMPANY_LINKS = [{ href: '/about', label: 'Qui sommes-nous' }];

const PAYMENT_LOGOS = [
  { name: 'Visa', src: '/visa.png' },
  { name: 'Wave', src: '/wave-money.png' },
  { name: 'Orange Money', src: '/orange-money.webp' },
  { name: 'Djamo', src: '/djamo.svg' },
];

interface FooterColumnProps {
  title: string;
  links: { href: string; label: string }[];
}

function FooterColumn({ title, links }: FooterColumnProps) {
  return (
    <div>
      <h3 className={columnTitleClasses}>{title}</h3>
      <nav className="flex flex-col gap-2">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={linkClasses}>
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

// Réutilise la même clé de cache que PublicNavbarCategories
// (queryKeys.eventCategories()) — aucune requête /event-categories
// dupliquée si la navbar l'a déjà chargée dans la session.
function DiscoverColumn() {
  const categoriesQuery = useQuery<EventCategory[]>({
    queryKey: queryKeys.eventCategories(),
    queryFn: async () => (await apiClient.get('/event-categories')).data,
  });
  const categories = categoriesQuery.data ?? [];

  return (
    <div>
      <h3 className={columnTitleClasses}>Découvrir</h3>
      <nav className="flex flex-col gap-2">
        <Link href="/events" className={linkClasses}>
          Tous les évènements
        </Link>
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/events?category=${category.slug}`}
            className={`flex items-center gap-1.5 ${linkClasses}`}
          >
            <Icon icon={CATEGORY_ICONS[category.icon]} className="h-[14px] w-[14px]" />
            {category.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

// Aucun compte réel pour l'instant — rendu inerte (<span>, pas <a>) plutôt
// qu'un lien mort. Basculer en vrai lien dès qu'une URL existe, sans
// toucher au reste du composant.
function SocialIcons() {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="text-on-dark">
        <FacebookIcon className="h-5 w-5" />
      </span>
      <span aria-hidden="true" className="text-on-dark">
        <InstagramIcon className="h-5 w-5" />
      </span>
      {/* Pas d'icône TikTok dans Lucide — asset téléchargé forcé en blanc
          pour rester visuellement cohérent avec les deux icônes Lucide
          voisines plutôt qu'affiché dans ses couleurs d'origine. */}
      <span aria-hidden="true">
        <img src="/tiktok.webp" alt="" className="h-5 w-5 brightness-0 invert" />
      </span>
    </div>
  );
}

// Ni mobile-organizer ni mobile-scan ne sont publiés sur un store — badges
// inertes en attendant, même traitement que SocialIcons ci-dessus.
function AppStoreBadges() {
  return (
    <div className="flex flex-col gap-2">
      <span>
        <img src="/available-on-app-store.webp" alt="Bientôt sur l'App Store" className="h-9 w-auto" />
      </span>
      <span>
        <img src="/get-in-on-google-play.webp" alt="Bientôt sur Google Play" className="h-9 w-auto" />
      </span>
    </div>
  );
}

// Puce claire uniforme derrière chaque logo — certains sont en noir pur
// (Djamo) ou mêlent du texte noir à leur couleur de marque (Wave, Orange
// Money), illisibles tels quels sur le fond sombre du footer.
function PaymentLogos() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PAYMENT_LOGOS.map((logo) => (
        <div key={logo.name} className="flex h-9 items-center rounded bg-card px-3">
          <img src={logo.src} alt={logo.name} className="h-4 w-auto" />
        </div>
      ))}
    </div>
  );
}

export function PublicFooter() {
  return (
    <footer className="bg-ink text-on-dark">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="flex flex-col gap-6 lg:max-w-[260px] lg:shrink-0">
            <Wordmark className="text-on-dark" />

            <div>
              <h3 className={columnTitleClasses}>Restons connectés</h3>
              <SocialIcons />
            </div>

            <div>
              <h3 className={columnTitleClasses}>Téléchargez nos apps</h3>
              <AppStoreBadges />
            </div>

            <p className="text-[12px] text-on-dark-muted">
              En continuant, vous acceptez nos{' '}
              <Link href="/terms" className="underline hover:text-on-dark">
                CGU
              </Link>
              .
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5 lg:flex-1">
            <DiscoverColumn />
            <FooterColumn title="Organisateurs" links={ORGANIZER_LINKS} />
            <FooterColumn title="Aide & Support" links={HELP_LINKS} />
            <FooterColumn title="Légal" links={LEGAL_LINKS} />
            <FooterColumn title="Entreprise" links={COMPANY_LINKS} />
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/[0.08] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[13px] font-semibold text-on-dark-muted">Paiement 100&nbsp;% sécurisé via PayDunya</span>
          <PaymentLogos />
        </div>

        <div className="mt-6 border-t border-white/[0.08] pt-6 text-center sm:text-left">
          <span className="text-[12px] font-semibold text-on-dark-muted">© {new Date().getFullYear()} Zen Events</span>
        </div>
      </div>
    </footer>
  );
}
