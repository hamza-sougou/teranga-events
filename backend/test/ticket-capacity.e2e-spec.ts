import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

// Exercises fn_reserve_ticket_capacity (trg_reserve_ticket_capacity, BEFORE
// INSERT ON tickets — see db/schema.sql section 13) directly against a real
// Postgres connection. This must stay a DB-level test: the guarantee comes
// from the trigger's row lock on ticket_types, not from any application code.
describe('Anti-oversell — fn_reserve_ticket_capacity (concurrency)', () => {
  const prisma = new PrismaClient();

  let userId: string;
  let organizationId: string;
  let eventId: string;
  let ticketTypeId: string;
  let orderId: string;
  let orderItemId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `owner-${randomUUID()}@example.com`,
        passwordHash: 'irrelevant-for-this-test',
        fullName: 'Test Owner',
      },
    });
    userId = user.id;

    const organization = await prisma.organization.create({
      data: {
        name: 'Test Organization',
        slug: `test-org-${randomUUID()}`,
        ownerUserId: userId,
      },
    });
    organizationId = organization.id;

    const now = new Date();
    const event = await prisma.event.create({
      data: {
        organizationId,
        name: 'Test Event',
        slug: `test-event-${randomUUID()}`,
        startAt: now,
        endAt: new Date(now.getTime() + 60 * 60 * 1000),
        createdBy: userId,
      },
    });
    eventId = event.id;

    // Only one slot left: quantityTotal=1, quantitySold=0.
    const ticketType = await prisma.ticketType.create({
      data: {
        eventId,
        name: 'Last Seat',
        price: 100,
        quantityTotal: 1,
        saleStart: now,
        saleEnd: new Date(now.getTime() + 60 * 60 * 1000),
      },
    });
    ticketTypeId = ticketType.id;

    const order = await prisma.order.create({
      data: {
        eventId,
        buyerEmail: 'buyer@example.com',
        totalAmount: 100,
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
      },
    });
    orderId = order.id;

    const orderItem = await prisma.orderItem.create({
      data: {
        orderId,
        ticketTypeId,
        quantity: 1,
        unitPrice: 100,
        subtotal: 100,
      },
    });
    orderItemId = orderItem.id;
  });

  afterAll(async () => {
    // orders -> (cascade) order_items -> (cascade) tickets
    await prisma.order.delete({ where: { id: orderId } });
    await prisma.ticketType.delete({ where: { id: ticketTypeId } });
    await prisma.event.delete({ where: { id: eventId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('lets only one of two simultaneous ticket inserts succeed for the last remaining slot', async () => {
    const attempt = () =>
      prisma.ticket.create({
        data: { orderItemId, ticketTypeId, qrToken: randomUUID() },
      });

    const results = await Promise.allSettled([attempt(), attempt()]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toMatch(/Quota épuisé/);

    const refreshedType = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    expect(refreshedType.quantitySold).toBe(1);

    const ticketCount = await prisma.ticket.count({ where: { ticketTypeId } });
    expect(ticketCount).toBe(1);
  });
});
