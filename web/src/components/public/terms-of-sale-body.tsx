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
        Les présentes conditions générales de vente (CGV) régissent l&apos;achat d&apos;un billet sur Zen Events,
        distinctement des{' '}
        <Link href="/terms" className="font-semibold text-indigo underline">
          conditions générales d&apos;utilisation
        </Link>{' '}
        qui régissent l&apos;usage général de la plateforme.
      </p>
    ),
  },
  {
    id: 'prix',
    navLabel: '2. Prix et commission',
    title: '2. Prix et commission',
    body: (
      <>
        <p>
          Le prix de base d&apos;un billet est fixé librement par l&apos;organisateur de l&apos;évènement. Une
          commission Zen Events de 5% est ajoutée à ce prix au moment du paiement — elle n&apos;est jamais déduite du
          montant reversé à l&apos;organisateur, qui reçoit intégralement le prix qu&apos;il a fixé.
        </p>
        <p>
          Le prix affiché au moment du paiement peut varier légèrement selon le moyen de paiement choisi (carte ou
          mobile money), les frais de traitement associés à chaque canal étant intégrés au calcul.{' '}
          <Link href="/pricing" className="font-semibold text-indigo underline">
            Voir le détail du modèle de commission
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    id: 'paiement',
    navLabel: '3. Paiement',
    title: '3. Modalités de paiement',
    body: (
      <p>
        Le paiement s&apos;effectue en ligne via PayDunya, par carte bancaire ou mobile money (Wave, Orange Money,
        Free Money, Djamo). Zen Events ne stocke à aucun moment les données de carte bancaire du client — celles-ci
        sont traitées directement par PayDunya.
      </p>
    ),
  },
  {
    id: 'reservation',
    navLabel: '4. Réservation',
    title: '4. Réservation et confirmation',
    body: (
      <p>
        Un billet est réservé dès son ajout au panier, pour une durée limitée (environ 15 minutes) le temps de
        finaliser le paiement — passé ce délai, la réservation est libérée. Une fois le paiement confirmé, le billet
        est délivré immédiatement par email.
      </p>
    ),
  },
  {
    id: 'livraison',
    navLabel: '5. Livraison du billet',
    title: '5. Livraison du billet',
    body: (
      <p>
        Le billet est exclusivement électronique, sous forme de QR code à présenter à l&apos;entrée de
        l&apos;évènement. Aucun billet physique n&apos;est proposé à ce jour.
      </p>
    ),
  },
  {
    id: 'remboursement',
    navLabel: '6. Remboursement',
    title: '6. Remboursement, annulation, transfert et revente',
    body: (
      <p>
        En résumé : un remboursement intégral n&apos;est dû que si l&apos;organisateur annule l&apos;évènement ;
        aucun remboursement n&apos;est possible si l&apos;acheteur ne peut plus assister à l&apos;évènement.{' '}
        <Link href="/refunds" className="font-semibold text-indigo underline">
          Voir le détail de notre politique de remboursement, d&apos;annulation, de transfert et de revente
        </Link>
        .
      </p>
    ),
  },
  {
    id: 'role',
    navLabel: '7. Rôle de Zen Events',
    title: '7. Rôle et responsabilité de Zen Events',
    body: (
      <p>
        Zen Events fournit la plateforme technique de billetterie et de paiement, mais n&apos;est pas
        l&apos;organisateur des évènements vendus sur la plateforme. La responsabilité de la bonne tenue de
        l&apos;évènement (lieu, sécurité, horaires, conformité) incombe exclusivement à l&apos;organisateur.
      </p>
    ),
  },
  {
    id: 'reclamations',
    navLabel: '8. Réclamations',
    title: '8. Réclamations',
    body: (
      <p>
        Toute réclamation relative à une commande peut être adressée via notre{' '}
        <Link href="/contact" className="font-semibold text-indigo underline">
          page de contact
        </Link>
        , en précisant le numéro de commande.
      </p>
    ),
  },
  {
    id: 'droit',
    navLabel: '9. Droit applicable',
    title: '9. Droit applicable et juridiction',
    body: (
      <p>
        Les présentes CGV sont soumises au droit sénégalais. Tout litige relatif à leur interprétation ou leur
        exécution relève de la compétence des juridictions de Dakar.
      </p>
    ),
  },
  {
    id: 'modification',
    navLabel: '10. Modification',
    title: '10. Modification des CGV',
    body: (
      <p>
        Zen Events peut modifier les présentes CGV à tout moment. Les CGV applicables à une commande sont celles en
        vigueur au moment de son paiement.
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
export function TermsOfSaleBody() {
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
        <h1 className="mb-3 text-[28px] font-black text-text">Conditions générales de vente</h1>
        <p className="mb-10 max-w-2xl text-[15px] text-text-muted">
          Applicables à tout achat de billet sur Zen Events.
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
