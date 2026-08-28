export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('token');
}

export function setToken(token: string): void {
  window.localStorage.setItem('token', token);
}

export function clearToken(): void {
  window.localStorage.removeItem('token');
}

// Full reload (not a router push) so React Query's cache and any other
// client-side state resets cleanly — same reasoning as the 401 handler in
// api-client.ts, which now calls this instead of duplicating it.
export function logout(): void {
  clearToken();
  window.location.href = '/login';
}
