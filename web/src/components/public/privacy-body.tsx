'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Kicker } from '@/components/ui/kicker';
import { legalInfo } from '@/lib/legal-info';

interface Section {
  id: string;
  navLabel: string;
  title: string;
  body: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'responsable',
    navLabel: '1. Responsable',
    title: '1. Responsable du traitement',
    body: (
      <p>
        Le responsable du traitement des données personnelles collectées sur Zen Events est {legalInfo.legalEntityName},{' '}
        {legalInfo.registeredAddress}. Pour toute question, écrivez à {legalInfo.contactEmail}.
      </p>
    ),
  },
  {
    id: 'donnees',
    navLabel: '2. Données collectées',
    title: '2. Données collectées',
    body: (
      <p>
        Données de compte (nom, email et/ou numéro de téléphone) pour les organisateurs et membres d&apos;équipe ;
        données de commande (billets achetés, historique) ; données de paiement, traitées directement par PayDunya —
        Zen Events ne collecte ni ne stocke aucune donnée de carte bancaire.
      </p>
    ),
  },
  {
    id: 'finalites',
    navLabel: '3. Finalités',
    title: '3. Finalités du traitement',
    body: (
      <p>
        Ces données sont utilisées pour la gestion des comptes, le traitement des commandes et paiements, le
        contrôle d&apos;accès aux évènements (validation des billets), et l&apos;envoi de communications liées à une
        commande ou à un évènement.
      </p>
    ),
  },
  {
    id: 'partage',
    navLabel: '4. Partage',
    title: '4. Partage des données',
    body: (
      <p>
        Les données sont partagées uniquement avec les prestataires techniques nécessaires au fonctionnement du
        service : PayDunya pour le traitement des paiements, et Cloudflare R2 pour l&apos;hébergement des médias
        publiés par les organisateurs (visuels et vidéos d&apos;évènements — pas de données personnelles de
        participants). Zen Events ne vend ni ne loue aucune donnée personnelle à des tiers.
      </p>
    ),
  },
  {
    id: 'conservation',
    navLabel: '5. Conservation',
    title: '5. Conservation des données',
    body: (
      <p>
        Les données de compte sont conservées tant que le compte est actif. Les données de commande sont conservées
        pour la durée nécessaire au respect des obligations comptables et légales applicables.
      </p>
    ),
  },
  {
    id: 'cookies',
    navLabel: '6. Cookies',
    title: '6. Cookies',
    body: (
      <p>
        Zen Events utilise uniquement des cookies strictement nécessaires au fonctionnement du site (session,
        authentification). Aucun cookie de mesure d&apos;audience ni de publicité n&apos;est utilisé à ce jour.
      </p>
    ),
  },
  {
    id: 'droits',
    navLabel: '7. Vos droits',
    title: '7. Droits des utilisateurs',
    body: (
      <p>
        Vous disposez d&apos;un droit d&apos;accès, de rectification, de suppression et d&apos;opposition sur vos
        données personnelles. Pour exercer ces droits,{' '}
        <Link href="/contact" className="font-semibold text-indigo underline">
          contactez-nous
        </Link>
        .
      </p>
    ),
  },
  {
    id: 'securite',
    navLabel: '8. Sécurité',
    title: '8. Sécurité des données',
    body: (
      <p>
        Zen Events met en œuvre des mesures techniques et organisationnelles raisonnables pour protéger vos données :
        chiffrement des échanges, accès restreint aux données par les équipes internes.
      </p>
    ),
  },
  {
    id: 'modification',
    navLabel: '9. Modification',
    title: '9. Modification de la politique',
    body: (
      <p>
        Cette politique de confidentialité peut être mise à jour. La version en vigueur est celle publiée sur cette
        page.
      </p>
    ),
  },
  {
    id: 'contact',
    navLabel: '10. Contact',
    title: '10. Contact',
    body: (
      <p>
        Pour toute question relative à vos données personnelles,{' '}
        <Link href="/contact" className="font-semibold text-indigo underline">
          contactez-nous
        </Link>
        .
      </p>
    ),
  },
];

function SectionNavList({
  activeId,
  onSelect,
  className,
  itemClassName,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
  itemClassName: (active: boolean) => string;
}) {
  return (
    <nav className={className} aria-label="Sommaire">
      {SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => onSelect(section.id)}
          className={itemClassName(activeId === section.id)}
        >
          {section.navLabel}
        </button>
      ))}
    </nav>
  );
}

// Sommaire sticky + scroll-spy, même recette que how-it-works-body.tsx.
// Fond unique bg-bg : document de référence à lire, pas une page de conversion.
export function PrivacyBody() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const intersectingIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Sections here are short (a paragraph or two), unlike how-it-works-body.tsx's
    // richer blocks — several can intersect the detection band at once during a
    // jump-scroll. We track the full currently-intersecting set ourselves (a
    // callback only reports entries whose state just changed, not every target
    // still intersecting), then re-read live positions at decision time — an
    // entry's own `boundingClientRect` is frozen at its own crossing moment, so
    // comparing frozen values from different sections/times would rank them by
    // when they crossed, not by where they actually sit on screen.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) intersectingIds.current.add(entry.target.id);
          else intersectingIds.current.delete(entry.target.id);
        }
        let topId: string | null = null;
        let topValue = Infinity;
        for (const id of intersectingIds.current) {
          const top = sectionRefs.current[id]?.getBoundingClientRect().top;
          if (top !== undefined && top < topValue) {
            topValue = top;
            topId = id;
          }
        }
        if (topId) setActiveId(topId);
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    );

    for (const section of SECTIONS) {
      const el = sectionRefs.current[section.id];
      if (el) observer.observe(el);
    }

    // The last section can never reach the top of the detection band if the
    // document ends before it would naturally scroll that far — force it
    // active once the page is scrolled to its bottom.
    function handleScroll() {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom) setActiveId(SECTIONS[SECTIONS.length - 1].id);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  function scrollToSection(id: string) {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <main className="bg-bg">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
        <Kicker />
        <h1 className="mb-3 text-[28px] font-black text-text">Politique de confidentialité</h1>
        <p className="mb-10 max-w-2xl text-[15px] text-text-muted">
          Comment Zen Events collecte, utilise et protège vos données personnelles.
        </p>

        {/* Sommaire mobile : rangée de pastilles horizontales, sticky sous le header */}
        <div className="sticky top-0 z-10 -mx-6 mb-8 bg-bg px-6 py-3 sm:-mx-10 sm:px-10 lg:hidden">
          <SectionNavList
            activeId={activeId}
            onSelect={scrollToSection}
            className="flex gap-2 overflow-x-auto"
            itemClassName={(active) =>
              cn(
                'shrink-0 whitespace-nowrap rounded border-[1.5px] px-3 py-1.5 text-[13px] font-semibold transition-colors',
                active ? 'border-indigo bg-indigo/5 text-indigo' : 'border-border bg-card text-text-muted',
              )
            }
          />
        </div>

        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
          {/* Sommaire desktop : colonne sticky */}
          <SectionNavList
            activeId={activeId}
            onSelect={scrollToSection}
            className="sticky top-24 hidden h-fit flex-col gap-1 lg:flex"
            itemClassName={(active) =>
              cn(
                'rounded px-3 py-2.5 text-left text-[13px] font-semibold transition-colors',
                active ? 'bg-indigo/5 text-indigo' : 'text-text-muted hover:text-text',
              )
            }
          />

          <div className="flex max-w-2xl flex-col gap-10">
            {SECTIONS.map((section) => (
              <section
                key={section.id}
                id={section.id}
                ref={(el) => {
                  sectionRefs.current[section.id] = el;
                }}
                className="scroll-mt-32"
              >
                <h2 className="mb-3 text-[18px] font-black text-text">{section.title}</h2>
                <div className="flex flex-col gap-3 text-[14px] text-text-muted">{section.body}</div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
