// Centralized React Query key builders so the events list, the edit page,
// and the ticket-type/whitelist modals all invalidate exactly the same
// cache entries — a typo'd literal key array is otherwise an easy silent bug
// across that many call sites.
export const queryKeys = {
  events: (organizationId?: string) => ['org-events', organizationId],
  event: (organizationId?: string, eventId?: string) => ['org-event', organizationId, eventId],
  ticketTypes: (organizationId?: string, eventId?: string) => ['org-ticket-types', organizationId, eventId],
  whitelist: (organizationId?: string, eventId?: string, ticketTypeId?: string) => [
    'org-ticket-type-whitelist',
    organizationId,
    eventId,
    ticketTypeId,
  ],
  orgStats: (organizationId?: string) => ['org-stats', organizationId],
  media: (organizationId?: string, eventId?: string) => ['org-event-media', organizationId, eventId],
  eventCategories: () => ['event-categories'],
  orders: (organizationId?: string, eventId?: string) => ['org-event-orders', organizationId, eventId],
  scans: (organizationId?: string, eventId?: string) => ['org-event-scans', organizationId, eventId],
};
