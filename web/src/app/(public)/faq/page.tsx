import Link from 'next/link';
import { Kicker } from '@/components/ui/kicker';
import { buttonClasses } from '@/components/ui/button';
import { FaqAccordion, type FaqItem } from '@/components/public/faq-accordion';

const linkClasses = 'font-semibold text-indigo underline';

const PARTICIPANT_QUESTIONS: FaqItem[] = [
  {
    question: 'Comment acheter un billet ?',
    answer: (
      <p>
        Depuis la page d&apos;un évènement, choisissez votre type de billet et la quantité souhaitée, renseignez
        votre email (et votre téléphone si vous le souhaitez), puis payez en toute sécurité. Votre billet, avec son
        QR code, est disponible immédiatement après le paiement.
      </p>
    ),
  },
  {
    question: 'Quels moyens de paiement sont acceptés ?',
    answer: (
      <p>
        Carte bancaire, Wave, Orange Money et Djamo, via notre partenaire de paiement PayDunya. Vous choisissez
        l&apos;instrument qui vous convient au moment de payer.
      </p>
    ),
  },
  {
    question: "Où trouver mon billet après l'achat ?",
    answer: (
      <p>
        Sur la page de confirmation affichée à la fin du paiement, et dans l&apos;email de confirmation que vous
        recevez juste après — conservez-le, il donne accès à votre billet et à son QR code.
      </p>
    ),
  },
  {
    question: "Puis-je me faire rembourser si je change d'avis ?",
    answer: (
      <p>
        Non, un achat n&apos;est pas remboursable si vous ne pouvez plus assister à l&apos;évènement. Le détail des
        cas où un remboursement s&apos;applique est expliqué sur notre page{' '}
        <Link href="/refunds" className={linkClasses}>
          Remboursements &amp; annulations
        </Link>
        .
      </p>
    ),
  },
  {
    question: "Que se passe-t-il si l'évènement est annulé ?",
    answer: (
      <p>
        Vous êtes notifié par email dès l&apos;annulation. Le détail de la marche à suivre est expliqué sur notre
        page{' '}
        <Link href="/refunds" className={linkClasses}>
          Remboursements &amp; annulations
        </Link>
        .
      </p>
    ),
  },
];

const ORGANIZER_QUESTIONS: FaqItem[] = [
  {
    question: 'Comment créer un compte organisateur ?',
    answer: (
      <p>
        Inscrivez-vous avec un email ou un numéro de téléphone, ou connectez-vous en un clic avec un compte Google —
        aucun des deux n&apos;est obligatoire.
      </p>
    ),
  },
  {
    question: 'Combien coûte Zen Events ?',
    answer: (
      <p>
        Une commission unique de 5%, sans abonnement ni frais fixe. Le détail et un exemple chiffré sont sur notre
        page{' '}
        <Link href="/pricing" className={linkClasses}>
          Tarifs
        </Link>
        .
      </p>
    ),
  },
  {
    question: 'Quand suis-je payé ?',
    answer: (
      <p>
        Après la fin de votre évènement, jamais avant et jamais sur un calendrier fixe — un seul reversement,
        calculé sur l&apos;ensemble de vos commandes payées.
      </p>
    ),
  },
  {
    question: 'Comment inviter mon équipe ?',
    answer: (
      <p>
        Par email ou par téléphone, depuis la page Équipe de votre tableau de bord. La personne invitée active son
        compte avec un code à 6 chiffres — aucun compte Google requis.
      </p>
    ),
  },
  {
    question: 'Puis-je gérer plusieurs évènements avec un seul compte ?',
    answer: <p>Oui, un même compte peut posséder ou rejoindre plusieurs organisations.</p>,
  },
];

export default function FaqPage() {
  return (
    <main>
      <section className="bg-bg px-6 pt-16 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <Kicker />
          <h1 className="mb-3 text-[28px] font-black text-text">Foire aux questions</h1>
          <p className="text-[15px] text-text-muted">
            Les réponses aux questions les plus fréquentes, côté participant comme côté organisateur.
          </p>
        </div>
      </section>

      <section className="bg-bg px-6 py-14 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <Kicker />
          <h2 className="mb-5 text-[20px] font-black text-text">Pour les participants</h2>
          <FaqAccordion items={PARTICIPANT_QUESTIONS} />
        </div>
      </section>

      <section className="bg-ink px-6 py-14 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <Kicker tone="dark" />
          <h2 className="mb-5 text-[20px] font-black text-on-dark">Pour les organisateurs</h2>
          <FaqAccordion items={ORGANIZER_QUESTIONS} />
        </div>
      </section>

      <section className="bg-indigo py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:px-10">
          <Kicker tone="onAccent" />
          <h2 className="text-2xl font-black leading-tight text-white sm:text-3xl">
            Vous ne trouvez pas votre réponse ?
          </h2>
          <Link href="/contact" className={buttonClasses('primary', 'mt-2 bg-white !text-indigo hover:opacity-90')}>
            Contactez-nous
          </Link>
        </div>
      </section>
    </main>
  );
}
