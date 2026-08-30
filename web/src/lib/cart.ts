export interface CartItem {
  ticketTypeId: string;
  quantity: number;
}

// UUID check is deliberately loose (any non-empty segment before the ':') —
// the checkout page cross-references parsed ids against the real
// GET /events/:slug/ticket-types response and silently drops anything that
// doesn't match, so a malformed id here just means "filtered out later",
// not a crash.
function isValidEntry(ticketTypeId: string, quantityRaw: string): boolean {
  if (!ticketTypeId) return false;
  const quantity = Number(quantityRaw);
  return Number.isInteger(quantity) && quantity > 0;
}

// Parses the `items` query param, format `ticketTypeId:qty,ticketTypeId:qty`.
// Malformed entries (missing ':', non-integer/zero/negative quantity) are
// dropped rather than throwing — a partially-corrupt URL should degrade to
// "fewer items in the cart", never a broken page. A repeated ticketTypeId
// keeps its last occurrence (mirrors how the sidesheet's `quantities` state
// itself never holds duplicate keys, so a hand-edited URL is the only way
// this can happen).
export function parseCartItems(searchParams: URLSearchParams): CartItem[] {
  const raw = searchParams.get('items');
  if (!raw) return [];

  const byTicketTypeId = new Map<string, number>();
  for (const entry of raw.split(',')) {
    const [ticketTypeId, quantityRaw] = entry.split(':');
    if (ticketTypeId === undefined || quantityRaw === undefined) continue;
    if (!isValidEntry(ticketTypeId, quantityRaw)) continue;
    byTicketTypeId.set(ticketTypeId, Number(quantityRaw));
  }

  return Array.from(byTicketTypeId, ([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
}

export function serializeCartItems(items: CartItem[]): string {
  return items
    .filter((item) => item.quantity > 0)
    .map((item) => `${item.ticketTypeId}:${item.quantity}`)
    .join(',');
}
