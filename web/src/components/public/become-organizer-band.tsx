import Link from 'next/link';
import { Kicker } from '@/components/ui/kicker';
import { buttonClasses } from '@/components/ui/button';

// Full-bleed accent band — no reference mockup survives for this one (the
// original homepage direction was rejected, see docs/DESIGN_SYSTEM.md), so
// built fresh from the current tokens rather than adapted from a file that
// no longer exists.
export function BecomeOrganizerBand() {
  return (
    <section className="bg-indigo py-14">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:px-10">
        <Kicker tone="onAccent" />
        <h2 className="text-2xl font-black leading-tight text-white sm:text-3xl">
          Organisez votre prochain évènement avec Zen Events
        </h2>
        <p className="max-w-md text-[14px] font-semibold text-on-dark">
          Billetterie, contrôle d&apos;accès, statistiques en temps réel — tout ce qu&apos;il faut pour vendre et gérer vos
          places.
        </p>
        <Link href="/login" className={buttonClasses('primary', 'mt-2 bg-white !text-indigo hover:opacity-90')}>
          Je suis organisateur
        </Link>
      </div>
    </section>
  );
}
