// Senegal mobile money number: local 7XXXXXXXX (9 digits, starts with 7) or
// E.164 +2217XXXXXXXX. No prior precedent in the repo for this format — first
// phone validation introduced in the codebase.
export const SENEGAL_PHONE_REGEX = /^(\+221)?7\d{8}$/;
export const SENEGAL_PHONE_MESSAGE =
  'Numéro invalide — format attendu : 7XXXXXXXX ou +2217XXXXXXXX';

// Wider input regex for auth flows (backend/src/auth/), which normalize to
// E.164 before validation — tolerates the extra forms a user is likely to
// type (leading 0, spaces/dashes) that SENEGAL_PHONE_REGEX deliberately does
// not accept, since the two organizations/ DTOs above store the value as-is
// with no normalization step and must keep rejecting those forms unchanged.
export const SENEGAL_PHONE_INPUT_REGEX = /^(\+221[\s-]?|0)?7[\s-]?\d(?:[\s-]?\d){7}$/;
export const SENEGAL_PHONE_INPUT_MESSAGE =
  'Numéro invalide — format attendu : 7XXXXXXXX, 07XXXXXXXX ou +2217XXXXXXXX';

// Normalizes any of the SENEGAL_PHONE_INPUT_REGEX-accepted input forms
// (7XXXXXXXX, 07XXXXXXXX, +2217XXXXXXXX, with optional spaces/dashes) to
// strict E.164 (+2217XXXXXXXX). In the auth DTOs this runs as a
// @Transform, which class-transformer/Nest's ValidationPipe (transform:
// true) applies BEFORE @Matches ever sees the value — so @Matches actually
// validates this function's output, not the raw input. That still rejects
// garbage correctly (e.g. normalizeSenegalPhone('abc') => '+221abc', which
// SENEGAL_PHONE_INPUT_REGEX then fails), just via the normalized form.
export function normalizeSenegalPhone(raw: string): string {
  const digitsOnly = raw.replace(/[\s-]/g, '');
  const local = digitsOnly.startsWith('+221')
    ? digitsOnly.slice(4)
    : digitsOnly.startsWith('0')
      ? digitsOnly.slice(1)
      : digitsOnly;
  return `+221${local}`;
}
