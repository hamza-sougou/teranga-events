'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Kicker } from '@/components/ui/kicker';

interface Section {
  id: string;
  navLabel: string;
  title: string;
  body: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'objet',
    navLabel: '1. Objet',
    title: '1. Objet',
    body: (
      <p>
        Les présentes conditions générales d&apos;utilisation (CGU) régissent l&apos;accès et l&apos;usage du site et
        des applications Zen Events (web et mobile), plateforme de billetterie événementielle. Zen Events agit comme
        intermédiaire technique entre les organisateurs d&apos;évènements et les participants ; elle n&apos;organise
        elle-même aucun des évènements listés sur la plateforme.
      </p>
    ),
  },
  {
    id: 'comptes',
    navLabel: '2. Comptes et rôles',
    title: '2. Comptes et rôles',
    body: (
      <>
        <p>
          La création d&apos;un compte est nécessaire pour organiser un évènement, mais jamais pour en acheter un
          billet. Toute personne créant un compte s&apos;engage à fournir des informations exactes et à préserver la
          confidentialité de ses identifiants — toute activité effectuée depuis un compte est présumée effectuée par
          son titulaire.
        </p>
        <p>
          Un compte organisateur peut donner accès à plusieurs rôles, chacun limité à son périmètre : Organisateur
          (accès complet), Co-organisateur (gestion de l&apos;évènement), Vendeur (vente sur le terrain), Contrôleur /
          Vigile (scan des billets à l&apos;entrée uniquement) et Comptable (suivi des ventes et reversements, en
          lecture seule). L&apos;invitation d&apos;un membre à l&apos;un de ces rôles engage l&apos;organisateur qui
          l&apos;invite.
        </p>
      </>
    ),
  },
  {
    id: 'utilisation',
    navLabel: '3. Utilisation',
    title: '3. Utilisation de la plateforme',
    body: (
      <p>
        L&apos;organisateur est seul responsable du contenu qu&apos;il publie (description, visuels, conditions
        d&apos;accès de son évènement) et garantit disposer des droits nécessaires à sa diffusion. Il s&apos;engage à
        ne publier aucun évènement illicite, trompeur ou portant atteinte aux droits d&apos;un tiers. Zen Events se
        réserve le droit de retirer tout contenu non conforme.
      </p>
    ),
  },
  {
    id: 'propriete',
    navLabel: '4. Propriété intellectuelle',
    title: '4. Propriété intellectuelle',
    body: (
      <p>
        La marque Zen Events, son logo et l&apos;ensemble des éléments du site (interface, textes, code) sont
        protégés et ne peuvent être reproduits sans autorisation. Les contenus publiés par les organisateurs restent
        leur propriété.
      </p>
    ),
  },
  {
    id: 'disponibilite',
    navLabel: '5. Disponibilité',
    title: '5. Disponibilité du service',
    body: (
      <p>
        Zen Events met en œuvre des moyens raisonnables pour assurer la disponibilité de la plateforme, sans garantir
        un accès continu et sans interruption — des opérations de maintenance ou des incidents techniques peuvent
        occasionner des indisponibilités temporaires.
      </p>
    ),
  },
  {
    id: 'suspension',
    navLabel: '6. Suspension de compte',
    title: '6. Suspension et modération',
    body: (
      <p>
        Zen Events peut suspendre ou clôturer un compte, ou retirer un évènement de la plateforme, en cas de
        violation des présentes CGU, de fraude avérée ou suspectée, ou de signalement fondé. L&apos;organisateur
        concerné en est informé par email.
      </p>
    ),
  },
  {
    id: 'responsabilite',
    navLabel: '7. Responsabilité',
    title: '7. Responsabilité',
    body: (
      <p>
        Zen Events fournit les outils de billetterie, de paiement et de contrôle d&apos;accès, mais n&apos;est pas
        l&apos;organisateur des évènements publiés sur la plateforme. La tenue effective de l&apos;évènement (lieu,
        sécurité, horaires, conformité réglementaire) relève exclusivement de la responsabilité de l&apos;organisateur.
      </p>
    ),
  },
  {
    id: 'droit',
    navLabel: '8. Droit applicable',
    title: '8. Droit applicable et juridiction',
    body: (
      <p>
        Les présentes CGU sont soumises au droit sénégalais. Tout litige relatif à leur interprétation ou leur
        exécution relève de la compétence des juridictions de Dakar.
      </p>
    ),
  },
  {
    id: 'modification',
    navLabel: '9. Modification',
    title: '9. Modification des CGU',
    body: (
      <p>
        Zen Events peut modifier les présentes CGU à tout moment, notamment pour refléter une évolution du service
        ou de la réglementation. La version en vigueur est celle publiée sur cette page.
      </p>
    ),
  },
  {
    id: 'contact',
    navLabel: '10. Contact',
    title: '10. Contact',
    body: (
      <p>
        Pour toute question relative aux présentes CGU,{' '}
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

// Sommaire sticky + scroll-spy, même recette que how-it-works-body.tsx — jamais
// un panneau à bascule qui masquerait du contenu (docs/DESIGN_SYSTEM.md).
// Fond unique bg-bg (pas d'alternance de bandes) : document de référence à
// lire, pas une page de conversion.
export function TermsBody() {
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
        <h1 className="mb-3 text-[28px] font-black text-text">Conditions générales d&apos;utilisation</h1>
        <p className="mb-10 max-w-2xl text-[15px] text-text-muted">
          Applicables à toute personne utilisant le site ou les applications Zen Events, avec ou sans compte.
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
