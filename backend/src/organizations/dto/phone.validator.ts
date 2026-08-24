// Senegal mobile money number: local 7XXXXXXXX (9 digits, starts with 7) or
// E.164 +2217XXXXXXXX. No prior precedent in the repo for this format — first
// phone validation introduced in the codebase.
export const SENEGAL_PHONE_REGEX = /^(\+221)?7\d{8}$/;
export const SENEGAL_PHONE_MESSAGE =
  'Numéro invalide — format attendu : 7XXXXXXXX ou +2217XXXXXXXX';
