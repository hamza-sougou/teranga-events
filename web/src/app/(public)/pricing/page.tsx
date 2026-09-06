import Link from 'next/link';
import { Kicker } from '@/components/ui/kicker';
import { buttonClasses } from '@/components/ui/button';

// Exemple chiffré repris tel quel de docs/SPEC.md §5.5 (ticket à 5 000 FCFA,
// reversement organisateur en mobile money) — ne pas recalculer ici, la
// formule de référence vit dans PricingService.quoteCheckout côté backend.
const CHANNELS = [
  { name: 'Mobile Money', displayedPrice: '≈ 5 475 FCFA' },
  { name: 'Carte', displayedPrice: '≈ 5 534 FCFA' },
  { name: 'Djamo', displayedPrice: '≈ 5 461 FCFA' },
];

// Même gabarit "sections alternées" que /how-it-works.
export default function PricingPage() {
  return (
    <main>
      <section className="bg-bg px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <Kicker />
          <h1 className="mb-3 text-[28px] font-black text-text">Tarifs</h1>
          <p className="text-[15px] text-text-muted">Une commission unique de 5%, jamais de frais cachés.</p>
        </div>
      </section>

      <section className="bg-ink px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <Kicker tone="dark" />
          <h2 className="mb-4 text-[20px] font-black text-on-dark">Le principe</h2>
          <div className="flex flex-col gap-4 text-[14px] text-on-dark-muted">
            <p>
              Zen Events garde <span className="font-bold text-on-dark">5% du prix que vous fixez</span>, quel que
              soit le moyen de paiement choisi par votre acheteur — mobile money, carte ou Djamo. Pas de taux
              différencié selon le canal.
            </p>
            <p>
              Ces 5% ne s&apos;ajoutent jamais visiblement à la caisse : le prix affiché à votre acheteur les inclut
              déjà. Ce prix varie légèrement selon le canal qu&apos;il choisit, car les frais bancaires prélevés par
              notre prestataire de paiement diffèrent d&apos;un canal à l&apos;autre — pas parce que notre commission
              change.
            </p>
            <p>Aucun abonnement, aucun frais fixe. Vous ne payez que sur les billets réellement vendus.</p>
          </div>
        </div>
      </section>

      <section className="bg-bg px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <Kicker />
          <h2 className="mb-2 text-[20px] font-black text-text">Un exemple concret</h2>
          <p className="mb-6 text-[14px] text-text-muted">
            Pour un billet fixé à <span className="font-bold text-text">5 000 FCFA</span> :
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[12px] font-extrabold uppercase tracking-wide text-text-muted">
                  <th className="py-3 pr-4">Canal choisi par l&apos;acheteur</th>
                  <th className="py-3 pr-4">Prix qu&apos;il paie</th>
                  <th className="py-3 pr-4">Zen Events garde</th>
                  <th className="py-3">Vous recevez</th>
                </tr>
              </thead>
              <tbody>
                {CHANNELS.map((channel) => (
                  <tr key={channel.name} className="border-b border-border">
                    <td className="py-3 pr-4 font-bold text-text">{channel.name}</td>
                    <td className="py-3 pr-4 text-text">{channel.displayedPrice}</td>
                    <td className="py-3 pr-4 text-emerald">≈ 250 FCFA (5%)</td>
                    <td className="py-3 font-bold text-text">5 000 FCFA</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-[13px] text-text-muted">
            Le reversement des 5 000 FCFA vous est versé après la fin de votre évènement, jamais avant.
          </p>
        </div>
      </section>

      <section className="bg-indigo py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:px-10">
          <Kicker tone="onAccent" />
          <h2 className="text-2xl font-black leading-tight text-white sm:text-3xl">
            Créez votre évènement en quelques minutes
          </h2>
          <Link href="/register" className={buttonClasses('primary', 'mt-2 bg-white !text-indigo hover:opacity-90')}>
            Créer mon compte
          </Link>
        </div>
      </section>
    </main>
  );
}
