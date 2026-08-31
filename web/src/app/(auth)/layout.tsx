import { Wordmark } from '@/components/ui/wordmark';

// No PublicNavbar here on purpose — same reasoning as (checkout): connexion/
// inscription is a focused flow, not a browsing surface. A minimal centered
// card instead, consistent across /login, /register and /register/google.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-bg px-6 py-12">
      <Wordmark className="mb-10" />
      <div className="w-full max-w-[440px] rounded-card border-[1.5px] border-border bg-card p-8">
        {children}
      </div>
    </div>
  );
}
