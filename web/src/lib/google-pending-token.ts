// Storage for the short-lived Google signup pending token — deliberately
// separate from lib/auth.ts's getToken/setToken/clearToken (real session
// JWT, localStorage). This is a proof of Google identity, not an access
// token: different storage (sessionStorage — gone once the signup tab
// closes, unlike a session that should survive a reload) and a different
// key, so the two can never be confused at a call site.
const STORAGE_KEY = 'zen-events:google-pending-token';

export function getGooglePendingToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(STORAGE_KEY);
}

export function setGooglePendingToken(token: string): void {
  window.sessionStorage.setItem(STORAGE_KEY, token);
}

export function clearGooglePendingToken(): void {
  window.sessionStorage.removeItem(STORAGE_KEY);
}
