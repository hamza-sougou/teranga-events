import { Kicker } from '@/components/ui/kicker';
import { ActivateInvitationForm } from '@/components/auth/activate-invitation-form';

export default function ActivateInvitationPage() {
  return (
    <>
      <Kicker />
      <h1 className="mb-1.5 text-[20px] font-black text-text">Activer mon compte</h1>
      <p className="mb-6 text-[13px] text-text-muted">
        Vous avez été invité(e) à rejoindre une équipe sur Zen Events. Entrez le code reçu par email ou SMS et
        choisissez votre mot de passe.
      </p>
      <ActivateInvitationForm />
    </>
  );
}
