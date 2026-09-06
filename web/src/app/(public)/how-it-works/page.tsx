import Link from 'next/link';
import { Kicker } from '@/components/ui/kicker';
import { buttonClasses } from '@/components/ui/button';
import { HowItWorksBody } from '@/components/public/how-it-works-body';

export default function HowItWorksPage() {
  return (
    <main>
      <section className="bg-bg px-6 pt-16 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <Kicker />
          <h1 className="mb-3 text-[28px] font-black text-text">Comment ça marche</h1>
          <p className="text-[15px] text-text-muted">
            Créer et vendre les billets de votre évènement, du premier clic au reversement final.
          </p>
        </div>
      </section>

      <HowItWorksBody />

      <section className="bg-indigo py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:px-10">
          <Kicker tone="onAccent" />
          <h2 className="text-2xl font-black leading-tight text-white sm:text-3xl">Prêt à créer votre évènement ?</h2>
          <Link href="/register" className={buttonClasses('primary', 'mt-2 bg-white !text-indigo hover:opacity-90')}>
            Créer mon compte
          </Link>
        </div>
      </section>
    </main>
  );
}
