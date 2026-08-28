import { getToken } from '../auth/tokenStore';
import { HttpError } from '../logic/classifyApiError';
import type { ApiErrorBody } from '../types/api';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

if (!BASE_URL) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is not set — create mobile-scan/.env from .env.example before starting the app.',
  );
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

// Thin fetch wrapper: builds the URL, attaches the bearer token, and turns a
// non-2xx response into a typed HttpError. A rejected fetch() (no
// connection) is left to propagate as-is — classifyApiError() is what turns
// that into a NETWORK failure, not this layer.
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (options.auth !== false) {
    const token = await getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      statusCode: response.status,
      message: response.statusText,
    }))) as ApiErrorBody;
    throw new HttpError(response.status, body);
  }

  return (await response.json()) as T;
}
