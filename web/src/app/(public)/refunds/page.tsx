import Link from 'next/link';
import { Kicker } from '@/components/ui/kicker';
import { buttonClasses } from '@/components/ui/button';

export default function RefundsPage() {
  return (
    <main>
      <section className="bg-bg px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <Kicker />
          <h1 className="mb-3 text-[28px] font-black text-text">Remboursements &amp; annulations</h1>
          <p className="text-[15px] text-text-muted">
            Ce qui se passe selon que c&apos;est vous ou l&apos;organisateur qui ne peut plus assurer
            l&apos;évènement.
          </p>
        </div>
      </section>

      <section className="bg-ink px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <Kicker tone="dark" />
          <h2 className="mb-4 text-[20px] font-black text-on-dark">Si l&apos;organisateur annule votre évènement</h2>
          <div className="flex flex-col gap-4 text-[14px] text-on-dark-muted">
            <p>
              Vous avez droit à un <span className="font-bold text-on-dark">remboursement intégral</span>. Vous êtes
              notifié par email dès que l&apos;annulation est enregistrée sur la plateforme.
            </p>
            <p>
              Le remboursement lui-même se fait aujourd&apos;hui{' '}
              <span className="font-bold text-on-dark">directement avec l&apos;organisateur</span> — ce n&apos;est
              pas encore un virement automatique déclenché par Zen Events. Suivez les modalités indiquées dans
              l&apos;email d&apos;annulation, et référez-vous à votre numéro de commande.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-bg px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <Kicker />
          <h2 className="mb-4 text-[20px] font-black text-text">Si vous ne pouvez plus y assister</h2>
          <p className="mb-4 text-[14px] text-text-muted">
            Un billet acheté n&apos;est pas remboursable si c&apos;est vous qui ne pouvez plus vous rendre à
            l&apos;évènement.
          </p>
          <div className="rounded-card border-[1.5px] border-indigo/20 bg-indigo/5 px-4 py-3">
            <p className="text-[13px] font-semibold text-text">
              À venir — transfert gratuit de billet. Vous pourrez donner votre billet à quelqu&apos;un de votre
              choix, sans frais, directement depuis votre compte. Cette fonctionnalité n&apos;est pas encore
              disponible.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-bg px-6 pb-16 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <Kicker />
          <h2 className="mb-4 text-[20px] font-black text-text">Revente encadrée</h2>
          <div className="flex flex-col gap-4 text-[14px] text-text-muted">
            <p>
              Une fois le transfert disponible, une revente encadrée le sera aussi : prix plafonné au montant que
              vous avez payé, jamais au-dessus, et paiement toujours géré par la plateforme — jamais un échange
              direct entre particuliers.
            </p>
          </div>
          <div className="mt-4 rounded-card border-[1.5px] border-indigo/20 bg-indigo/5 px-4 py-3">
            <p className="text-[13px] font-semibold text-text">
              À venir, comme le transfert de billet — pas encore disponible aujourd&apos;hui.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-indigo py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:px-10">
          <Kicker tone="onAccent" />
          <h2 className="text-2xl font-black leading-tight text-white sm:text-3xl">
            Une question sur une commande ?
          </h2>
          <Link href="/contact" className={buttonClasses('primary', 'mt-2 bg-white !text-indigo hover:opacity-90')}>
            Contactez-nous
          </Link>
        </div>
      </section>
    </main>
  );
}
