import { VerificationBanner } from '@/components/auth/verification-banner';
import type { CurrentUser } from '@/types';

// Mounted once in (organizer)/dashboard/layout.tsx — the only surface every
// organizer page shares after login/register. Non-blocking by design (see
// docs/SPEC.md — email verification never gates login): a dismissible
// notice, never a full-screen wall.
export function EmailVerificationBanner({ user }: { user: CurrentUser }) {
  // Google accounts never get a verification code — see
  // AuthService#resendVerificationCode's passwordHash guard.
  const visible = !!user.email && !user.emailVerifiedAt && user.hasPassword;

  return (
    <VerificationBanner
      visible={visible}
      message="Vérifiez votre adresse email pour sécuriser votre compte."
      verifyPath="/auth/verify-email"
      resendPath="/auth/verify-email/resend"
    />
  );
}
