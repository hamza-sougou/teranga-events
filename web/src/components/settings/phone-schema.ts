import { z } from 'zod';

// Mirrors backend/src/organizations/dto/phone.validator.ts's
// SENEGAL_PHONE_REGEX — no shared package between web/ and backend/ in this
// monorepo, so kept in sync by hand.
export const SENEGAL_PHONE_REGEX = /^(\+221)?7\d{8}$/;
export const SENEGAL_PHONE_MESSAGE = 'Format attendu : 7XXXXXXXX ou +2217XXXXXXXX.';
