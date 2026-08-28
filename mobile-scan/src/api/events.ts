import { apiRequest } from './client';
import type { EventSummary } from '../types/api';

export function listEvents(organizationId: string): Promise<EventSummary[]> {
  return apiRequest<EventSummary[]>(`/organizations/${organizationId}/events`);
}
