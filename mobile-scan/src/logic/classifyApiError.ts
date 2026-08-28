import type { ApiErrorBody } from '../types/api';

export interface NetworkFailure {
  kind: 'NETWORK';
}

export interface ApiFailure {
  kind: 'API';
  statusCode: number;
  message: string;
}

export interface UnknownFailure {
  kind: 'UNKNOWN';
  message: string;
}

export type ClassifiedError = NetworkFailure | ApiFailure | UnknownFailure;

// A fetch() call rejects (not resolves-with-error-status) exactly when the
// request never completed: no connection, DNS failure, timeout. That's the
// only case that should ever produce the "pas de connexion" UI state —
// everything the server actually answered, even a 4xx/5xx, is an ApiFailure.
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: ApiErrorBody,
  ) {
    super(typeof body.message === 'string' ? body.message : body.message.join(', '));
  }
}

export function classifyApiError(error: unknown): ClassifiedError {
  if (error instanceof HttpError) {
    return { kind: 'API', statusCode: error.statusCode, message: error.message };
  }

  if (error instanceof TypeError) {
    // React Native's fetch throws a TypeError ("Network request failed") for
    // no-connection/DNS/timeout — there is no HTTP response to classify.
    return { kind: 'NETWORK' };
  }

  if (error instanceof Error) {
    return { kind: 'UNKNOWN', message: error.message };
  }

  return { kind: 'UNKNOWN', message: 'Unknown error' };
}
