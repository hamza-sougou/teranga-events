import Link from 'next/link';
import { Kicker } from '@/components/ui/kicker';
import { legalInfo } from '@/lib/legal-info';

export default function LegalNoticePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
      <Kicker />
      <h1 className="mb-4 text-[24px] font-black text-text">Mentions légales</h1>

      <div className="flex flex-col gap-6 text-[14px] text-text-muted">
        <div>
          <h2 className="mb-2 text-[16px] font-bold text-text">1. Éditeur du site</h2>
          <p>
            Le site et l&apos;application Zen Events sont édités par {legalInfo.legalEntityName}, {legalInfo.legalForm}{' '}
            au {legalInfo.shareCapital}, immatriculée au Registre du Commerce et du Crédit Mobilier (RCCM) sous le
            numéro {legalInfo.rccm} et identifiée au NINEA sous le numéro {legalInfo.ninea}, dont le siège social est
            situé {legalInfo.registeredAddress}.
          </p>
          <p className="mt-2">
            Contact : {legalInfo.contactEmail} — {legalInfo.contactPhone}.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-[16px] font-bold text-text">2. Directeur de la publication</h2>
          <p>{legalInfo.publicationDirector}.</p>
        </div>

        <div>
          <h2 className="mb-2 text-[16px] font-bold text-text">3. Hébergement</h2>
          <p>
            Le site est hébergé par {legalInfo.hostingProvider.name}, {legalInfo.hostingProvider.address}.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-[16px] font-bold text-text">4. Propriété intellectuelle</h2>
          <p>
            La marque Zen Events, son logo et l&apos;ensemble des éléments graphiques, textuels et logiciels du site
            sont la propriété de {legalInfo.legalEntityName}, sauf mention contraire, et ne peuvent être reproduits
            sans autorisation préalable. Les contenus publiés par les organisateurs (visuels, descriptions
            d&apos;évènements) restent leur propriété ; ils garantissent disposer des droits nécessaires à leur
            diffusion sur la plateforme.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-[16px] font-bold text-text">5. Droit applicable</h2>
          <p>
            Les présentes mentions légales sont soumises au droit sénégalais. Tout litige relève de la compétence
            des juridictions de Dakar.
          </p>
        </div>

        <p>
          Pour toute question,{' '}
          <Link href="/contact" className="font-semibold text-indigo underline">
            contactez-nous
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
