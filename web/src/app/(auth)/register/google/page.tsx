import { Kicker } from '@/components/ui/kicker';
import { GoogleCompleteForm } from '@/components/auth/google-complete-form';

export default function RegisterGooglePage() {
  return (
    <>
      <Kicker />
      <h1 className="mb-6 text-[20px] font-black text-text">Finaliser l&apos;inscription</h1>
      <GoogleCompleteForm />
    </>
  );
}
