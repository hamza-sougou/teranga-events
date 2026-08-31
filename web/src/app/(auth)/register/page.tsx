import { Kicker } from '@/components/ui/kicker';
import { RegisterForm } from '@/components/auth/register-form';

export default function RegisterPage() {
  return (
    <>
      <Kicker />
      <h1 className="mb-6 text-[20px] font-black text-text">Créer un compte</h1>
      <RegisterForm />
    </>
  );
}
