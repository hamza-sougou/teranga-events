import { VerificationBanner } from '@/components/auth/verification-banner';
import type { CurrentUser } from '@/types';

// Mirrors EmailVerificationBanner — mounted alongside it in
// (organizer)/dashboard/layout.tsx. Phone is never a Google identity, so no
// hasPassword guard is needed here (unlike the email banner): every account
// with a phoneNumber went through classic registration or invitation
// activation, both of which always set a real password.
export function PhoneVerificationBanner({ user }: { user: CurrentUser }) {
  const visible = !!user.phoneNumber && !user.phoneVerifiedAt;

  return (
    <VerificationBanner
      visible={visible}
      message="Vérifiez votre numéro de téléphone pour sécuriser votre compte."
      verifyPath="/auth/verify-phone"
      resendPath="/auth/verify-phone/resend"
    />
  );
}
