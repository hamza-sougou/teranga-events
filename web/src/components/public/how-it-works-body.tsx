'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  MailIcon,
  BadgeCheckIcon,
  CalendarIcon,
  ImageIcon,
  TicketIcon,
  LayersIcon,
  UserCheckIcon,
  ShirtIcon,
  UsersIcon,
  CreditCardIcon,
  ClockIcon,
  QrCodeIcon,
  SmartphoneIcon,
} from '@/components/ui/icons';

interface FeatureCard {
  icon: (props: { className?: string }) => React.ReactElement;
  title: string;
  description: string;
}

interface Step {
  id: string;
  navLabel: string;
  title: string;
  intro: string;
  cards?: FeatureCard[];
  note?: string;
}

const STEPS: Step[] = [
  {
    id: 'compte',
    navLabel: 'Créez votre compte',
    title: 'Créez votre compte',
    intro:
      'Un compte suffit pour organiser autant d’évènements que vous voulez, sous une ou plusieurs organisations.',
    cards: [
      {
        icon: MailIcon,
        title: 'Email ou téléphone',
        description: 'Inscrivez-vous avec l’identifiant qui vous convient — pas de compte Google obligatoire.',
      },
      {
        icon: BadgeCheckIcon,
        title: 'Connexion Google',
        description: 'Ou connectez-vous en un clic avec un compte Google déjà existant.',
      },
    ],
  },
  {
    id: 'evenement',
    navLabel: 'Créez votre évènement',
    title: 'Créez votre évènement',
    intro: 'Renseignez les informations essentielles, votre page évènement est prête à être partagée.',
    cards: [
      {
        icon: CalendarIcon,
        title: 'Infos de base',
        description: 'Titre, date, lieu géolocalisé, catégorie et description de votre évènement.',
      },
      {
        icon: ImageIcon,
        title: 'Médias',
        description: 'Au moins une image (obligatoire pour publier), jusqu’à 8 images et 2 vidéos.',
      },
      {
        icon: LayersIcon,
        title: 'Types de billets',
        description: 'Standard, VIP, early-bird, groupe, ou prévente à accès restreint par liste blanche.',
      },
      {
        icon: ShirtIcon,
        title: 'Réglages optionnels',
        description: 'Âge minimum et dress code, si votre évènement en a besoin.',
      },
    ],
    note: 'Un évènement ne peut pas être publié tant qu’il n’a pas au moins une image.',
  },
  {
    id: 'equipe',
    navLabel: 'Composez votre équipe',
    title: 'Composez votre équipe',
    intro: 'Invitez les personnes qui vous aident à organiser, vendre ou contrôler l’accès.',
    cards: [
      {
        icon: UsersIcon,
        title: 'Co-organisateur',
        description: 'Accès complet à la gestion de l’évènement, sans les réglages du compte.',
      },
      {
        icon: TicketIcon,
        title: 'Vendeur',
        description: 'Vente de billets sur le terrain, sans accès aux autres réglages.',
      },
      {
        icon: QrCodeIcon,
        title: 'Contrôleur / Vigile',
        description: 'Scan des billets à l’entrée, rien d’autre.',
      },
      {
        icon: CreditCardIcon,
        title: 'Comptable',
        description: 'Suivi des ventes et des reversements, en lecture seule.',
      },
    ],
    note:
      'Invitation par email ou téléphone, activation par un code à 6 chiffres — aucun compte Google requis pour la personne invitée.',
  },
  {
    id: 'vente',
    navLabel: 'Vendez vos billets',
    title: 'Vendez vos billets',
    intro: 'Une fois publié, votre évènement est achetable en ligne, paiement sécurisé inclus.',
    cards: [
      {
        icon: CreditCardIcon,
        title: 'Paiement multicanal',
        description: 'Carte bancaire, Wave, Orange Money ou Djamo, via notre partenaire PayDunya.',
      },
      {
        icon: ClockIcon,
        title: 'Préventes',
        description: 'Fenêtre de vente dédiée, avec liste blanche optionnelle pour un accès restreint.',
      },
      {
        icon: TicketIcon,
        title: 'Réservation instantanée',
        description: 'Un billet est réservé dès son ajout au panier — jamais plus de billets vendus que de places disponibles.',
      },
    ],
  },
  {
    id: 'controle',
    navLabel: 'Contrôlez les entrées',
    title: 'Contrôlez les entrées',
    intro: 'Le jour J, votre équipe scanne les billets avec notre application dédiée.',
    cards: [
      {
        icon: QrCodeIcon,
        title: 'Scan QR code',
        description: 'Chaque billet ne peut être validé qu’une seule fois, même scanné en même temps par deux membres.',
      },
      {
        icon: SmartphoneIcon,
        title: 'Application dédiée',
        description: 'Réservée aux contrôleurs et vigiles — rien d’autre que le scan n’y est accessible.',
      },
    ],
    note: 'L’application nécessite une connexion internet au moment du scan.',
  },
  {
    id: 'paiement',
    navLabel: 'Soyez payé',
    title: 'Soyez payé',
    intro:
      'Un seul reversement par évènement, calculé sur l’ensemble de vos commandes payées, envoyé sur le numéro mobile money de votre organisation.',
    note:
      'Le reversement n’est déclenché qu’une fois votre évènement terminé — jamais avant, jamais en temps réel.',
  },
];

function StepNavList({
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
    <nav className={className} aria-label="Étapes">
      {STEPS.map((step, index) => (
        <button
          key={step.id}
          type="button"
          onClick={() => onSelect(step.id)}
          className={itemClassName(activeId === step.id)}
        >
          <span className={cn('text-[11px] font-extrabold', activeId === step.id ? 'text-indigo' : 'text-text-muted')}>
            {String(index + 1).padStart(2, '0')}
          </span>
          {step.navLabel}
        </button>
      ))}
    </nav>
  );
}

// Sommaire sticky + scroll-spy, jamais un panneau à bascule qui masquerait
// du contenu (docs/DESIGN_SYSTEM.md / principe déjà posé dans
// public-navbar-categories.tsx : pas de nav cachée derrière un accordéon).
// Recette IntersectionObserver identique à celle du sentinel de home-hero.tsx.
export function HowItWorksBody() {
  const [activeId, setActiveId] = useState(STEPS[0].id);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    );

    for (const step of STEPS) {
      const el = sectionRefs.current[step.id];
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  function scrollToStep(id: string) {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
      {/* Sommaire mobile : rangée de pastilles horizontales, sticky sous le header */}
      <div className="sticky top-0 z-10 -mx-6 mb-8 bg-bg px-6 py-3 sm:-mx-10 sm:px-10 lg:hidden">
        <StepNavList
          activeId={activeId}
          onSelect={scrollToStep}
          className="flex gap-2 overflow-x-auto"
          itemClassName={(active) =>
            cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border-[1.5px] px-3 py-1.5 text-[13px] font-semibold transition-colors',
              active ? 'border-indigo bg-indigo/5 text-indigo' : 'border-border bg-card text-text-muted',
            )
          }
        />
      </div>

      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
        {/* Sommaire desktop : colonne sticky */}
        <StepNavList
          activeId={activeId}
          onSelect={scrollToStep}
          className="sticky top-24 hidden h-fit flex-col gap-1 lg:flex"
          itemClassName={(active) =>
            cn(
              'flex items-center gap-2.5 rounded px-3 py-2.5 text-left text-[13px] font-semibold transition-colors',
              active ? 'bg-indigo/5 text-indigo' : 'text-text-muted hover:text-text',
            )
          }
        />

        <div className="flex flex-col gap-16">
          {STEPS.map((step, index) => (
            <section
              key={step.id}
              id={step.id}
              ref={(el) => {
                sectionRefs.current[step.id] = el;
              }}
              className="scroll-mt-32"
            >
              <div className="mb-1 text-[12px] font-extrabold text-emerald">{String(index + 1).padStart(2, '0')}</div>
              <h2 className="mb-3 text-[22px] font-black text-text">{step.title}</h2>
              <p className="mb-6 max-w-2xl text-[14px] text-text-muted">{step.intro}</p>

              {step.cards && (
                <div className="mb-6 grid gap-4 sm:grid-cols-2">
                  {step.cards.map((card) => (
                    <div key={card.title} className="flex gap-3 rounded-card border-[1.5px] border-border bg-card p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-bg text-indigo">
                        <card.icon className="h-[18px] w-[18px]" />
                      </div>
                      <div>
                        <div className="mb-0.5 text-[13px] font-bold text-text">{card.title}</div>
                        <div className="text-[13px] text-text-muted">{card.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {step.note && (
                <p className="rounded-card border border-indigo/20 bg-indigo/5 px-4 py-3 text-[13px] font-semibold text-text">
                  Bon à savoir — {step.note}
                </p>
              )}

              {step.id === 'paiement' && (
                <Link href="/pricing" className="mt-3 inline-block text-[13px] font-semibold text-indigo underline">
                  Voir le détail de la commission
                </Link>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
