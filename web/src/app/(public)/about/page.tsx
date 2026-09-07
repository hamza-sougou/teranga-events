import Link from 'next/link';
import { Kicker } from '@/components/ui/kicker';

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
      <Kicker />
      <h1 className="mb-4 text-[24px] font-black text-text">Qui sommes-nous</h1>

      <div className="flex flex-col gap-6 text-[14px] text-text-muted">
        <p>
          Zen Events est une plateforme de billetterie événementielle en ligne pour le Sénégal — concerts, festivals,
          soirées, cérémonies. Elle permet de créer un évènement, vendre des billets en ligne et contrôler les
          entrées le jour J, sans dépendre de billets papier ni d&apos;un point de vente physique.
        </p>

        <div>
          <h2 className="mb-2 text-[15px] font-bold text-text">Pour les organisateurs</h2>
          <p>
            Créez votre évènement, définissez vos types de billets (standard, VIP, prévente à accès restreint...),
            composez une équipe à rôles (co-organisateur, vendeur terrain, contrôleur à l&apos;entrée), vendez en
            ligne par carte ou mobile money (Wave, Orange Money, Free Money, Djamo) via PayDunya, et suivez vos
            ventes en temps réel. Le reversement de vos recettes est déclenché une fois l&apos;évènement terminé.{' '}
            <Link href="/how-it-works" className="font-semibold text-indigo underline">
              Voir comment ça marche →
            </Link>
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-[15px] font-bold text-text">Pour les participants</h2>
          <p>
            Achetez votre billet en ligne, sans créer de compte, avec un paiement sécurisé. Votre billet vous est
            envoyé sous forme de QR code, à présenter à l&apos;entrée — plus besoin d&apos;impression ni de file
            d&apos;attente au guichet.
          </p>
        </div>

        <p>
          Une question, une suggestion ?{' '}
          <Link href="/contact" className="font-semibold text-indigo underline">
            Contactez-nous
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
