import Link from 'next/link';
import { Kicker } from '@/components/ui/kicker';
import { MailIcon, PhoneIcon } from '@/components/ui/icons';
import { legalInfo } from '@/lib/legal-info';

export default function ContactPage() {
  return (
    <main>
      <section className="bg-bg px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <Kicker />
          <h1 className="mb-3 text-[28px] font-black text-text">Contact</h1>
          <p className="text-[15px] text-text-muted">
            Une question sur une commande, un évènement ou votre compte organisateur ? La plupart des réponses sont
            déjà dans notre{' '}
            <Link href="/faq" className="font-semibold text-indigo underline">
              foire aux questions
            </Link>
            . Sinon, écrivez-nous directement.
          </p>
        </div>
      </section>

      <section className="bg-bg px-6 pb-16 sm:px-10">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <a
            href={`mailto:${legalInfo.contactEmail}`}
            className="flex items-center gap-4 rounded-card border-[1.5px] border-border bg-card px-5 py-4 transition-colors hover:border-indigo"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-bg text-indigo">
              <MailIcon className="h-[18px] w-[18px]" />
            </div>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wide text-text-muted">Email</div>
              <div className="text-[15px] font-bold text-text">{legalInfo.contactEmail}</div>
            </div>
          </a>

          <a
            href={`tel:${legalInfo.contactPhone.replace(/\s+/g, '')}`}
            className="flex items-center gap-4 rounded-card border-[1.5px] border-border bg-card px-5 py-4 transition-colors hover:border-indigo"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-bg text-indigo">
              <PhoneIcon className="h-[18px] w-[18px]" />
            </div>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wide text-text-muted">Téléphone</div>
              <div className="text-[15px] font-bold text-text">{legalInfo.contactPhone}</div>
            </div>
          </a>
        </div>
      </section>
    </main>
  );
}
