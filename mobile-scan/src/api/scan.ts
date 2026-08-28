import { apiRequest } from './client';
import type { ScanTicketResponse } from '../types/api';

export function scanTicket(
  organizationId: string,
  eventId: string,
  qrToken: string,
): Promise<ScanTicketResponse> {
  return apiRequest<ScanTicketResponse>(`/organizations/${organizationId}/events/${eventId}/scan`, {
    method: 'POST',
    body: { qrToken },
  });
}
