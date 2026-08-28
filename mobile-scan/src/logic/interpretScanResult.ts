import type { ScanTicketResponse } from '../types/api';
import type { ClassifiedError } from './classifyApiError';

export type ScanOutcome =
  | { kind: 'SUCCESS'; ticketTypeName: string; holderName: string | null }
  | { kind: 'ALREADY_USED'; ticketTypeName: string }
  | { kind: 'INVALID' }
  | { kind: 'EXPIRED_EVENT' }
  | { kind: 'NO_CONNECTION' }
  | { kind: 'SCAN_ERROR'; message: string };

// The only place backend ScanResultCode -> on-screen state is decided.
// Never called with a raw network error; that path goes through
// interpretScanFailure below, so a dropped connection can never map onto
// one of the ticket-verdict states by accident.
export function interpretScanSuccess(response: ScanTicketResponse): ScanOutcome {
  switch (response.result) {
    case 'SUCCESS':
      return {
        kind: 'SUCCESS',
        ticketTypeName: response.ticket.ticketTypeName,
        holderName: response.ticket.holderName,
      };
    case 'ALREADY_USED':
      return { kind: 'ALREADY_USED', ticketTypeName: response.ticket.ticketTypeName };
    case 'EXPIRED_EVENT':
      return { kind: 'EXPIRED_EVENT' };
    case 'INVALID':
      return { kind: 'INVALID' };
    default:
      // Defensive: an unrecognized result code from the backend must never
      // silently render as a false SUCCESS at a door.
      return { kind: 'SCAN_ERROR', message: `Unknown scan result: ${String(response.result)}` };
  }
}

export function interpretScanFailure(error: ClassifiedError): ScanOutcome {
  if (error.kind === 'NETWORK') {
    return { kind: 'NO_CONNECTION' };
  }
  return { kind: 'SCAN_ERROR', message: error.message };
}
