// Mirrors backend/src/organizations/dto/phone.validator.ts's
// SENEGAL_PHONE_REGEX — no shared package between web/ and backend/ in this
// monorepo, so kept in sync by hand.
export const SENEGAL_PHONE_REGEX = /^(\+221)?7\d{8}$/;
export const SENEGAL_PHONE_MESSAGE = 'Format attendu : 7XXXXXXXX ou +2217XXXXXXXX.';

// Mirrors the wider SENEGAL_PHONE_INPUT_REGEX in the same backend file —
// used by the auth DTOs (register/login), which normalize (leading 0,
// spaces/dashes tolerated) server-side via @Transform before validating.
// Deliberately a separate constant from SENEGAL_PHONE_REGEX above: the
// contact-phone/payout-phone settings forms send the value as-is with no
// normalization step and must keep rejecting those wider forms.
export const SENEGAL_PHONE_INPUT_REGEX = /^(\+221[\s-]?|0)?7[\s-]?\d(?:[\s-]?\d){7}$/;
export const SENEGAL_PHONE_INPUT_MESSAGE = 'Numéro invalide — format attendu : 7XXXXXXXX, 07XXXXXXXX ou +2217XXXXXXXX.';
