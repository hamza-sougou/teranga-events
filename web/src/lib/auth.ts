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
