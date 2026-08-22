import { isAxiosError } from 'axios';

// Nest's ValidationPipe/exception filters respond with { message: string |
// string[] }. Extracts a single displayable string from that shape.
export function getApiErrorMessage(error: unknown, fallback = "Une erreur est survenue. Réessayez."): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(' ');
    if (typeof message === 'string') return message;
  }
  return fallback;
}
