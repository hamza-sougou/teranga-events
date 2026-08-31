// Parses the URL fragment /auth/callback receives from the backend
// (backend/src/auth/auth.controller.ts#googleCallback) — always a fragment,
// never a query string, so it's never sent to a server or logged. Kept as a
// standalone function with no `@/` imports (same reasoning as
// lib/interpret-order-status.ts) so it has zero module resolution
// dependencies and is testable with a bare `vitest run`.
export type GoogleCallbackResult =
  | { status: 'login' | 'login_linked'; token: string }
  | { status: 'signup_pending'; pendingToken: string }
  | { status: 'invalid' };

export function interpretGoogleCallback(hash: string): GoogleCallbackResult {
  const params = new URLSearchParams(hash);
  const status = params.get('status');

  if (status === 'login' || status === 'login_linked') {
    const token = params.get('token');
    if (!token) return { status: 'invalid' };
    return { status, token };
  }

  if (status === 'signup_pending') {
    const pendingToken = params.get('pendingToken');
    if (!pendingToken) return { status: 'invalid' };
    return { status: 'signup_pending', pendingToken };
  }

  return { status: 'invalid' };
}
