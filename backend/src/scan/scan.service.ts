import { Injectable, Logger } from '@nestjs/common';
import { EventStatus, ScanResult, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { ScanTicketDto } from './dto/scan-ticket.dto';

interface ScanUpdateRow {
  id: string;
  holder_name: string | null;
  holder_email: string | null;
  ticket_type_name: string;
}

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  // Must stay a single conditional UPDATE ... WHERE status = 'valid'
  // RETURNING id (see CLAUDE.md "Critical business rules" — scan anti-fraud),
  // never a SELECT followed by a separate UPDATE. The WHERE clause also
  // encodes "right event" and "event not cancelled/finished" so a 0-row
  // result covers every rejection reason at once, atomically.
  async scanTicket(organizationId: string, eventId: string, controllerUserId: string, dto: ScanTicketDto) {
    await this.eventsService.findOneForOrganization(organizationId, eventId);

    const updated = await this.prisma.$queryRaw<ScanUpdateRow[]>`
      UPDATE tickets t
      SET status = 'used', used_at = now()
      FROM ticket_types tt, events e
      WHERE t.qr_token = ${dto.qrToken}
        AND t.ticket_type_id = tt.id
        AND tt.event_id = ${eventId}::uuid AND tt.event_id = e.id
        AND t.status = 'valid'
        AND e.status != 'cancelled'
        AND e.end_at > now()
      RETURNING t.id, t.holder_name, t.holder_email, tt.name AS ticket_type_name
    `;

    if (updated.length > 0) {
      const row = updated[0];
      await this.prisma.scan.create({
        data: {
          ticketId: row.id,
          controllerUserId,
          gateOrZone: dto.gateOrZone,
          deviceId: dto.deviceId,
          result: ScanResult.SUCCESS,
        },
      });
      return {
        result: ScanResult.SUCCESS,
        ticket: {
          id: row.id,
          holderName: row.holder_name,
          holderEmail: row.holder_email,
          ticketTypeName: row.ticket_type_name,
        },
      };
    }

    // 0 rows affected — classify *why*, for the scans audit trail and the
    // API response only. This read happens strictly after the atomic
    // UPDATE above and never gates anything, so it introduces no race.
    const ticket = await this.prisma.ticket.findUnique({
      where: { qrToken: dto.qrToken },
      include: { ticketType: { include: { event: true } } },
    });

    if (!ticket) {
      // scans.ticket_id is NOT NULL — a completely unknown token has no
      // ticket to attach an audit row to, so it's logged, not persisted.
      this.logger.warn(`Scan attempt with an unknown qrToken at event ${eventId}`);
      return { result: ScanResult.INVALID };
    }

    const result = this.classifyResult(ticket, eventId);
    await this.prisma.scan.create({
      data: {
        ticketId: ticket.id,
        controllerUserId,
        gateOrZone: dto.gateOrZone,
        deviceId: dto.deviceId,
        result,
      },
    });

    return {
      result,
      ticket: {
        id: ticket.id,
        holderName: ticket.holderName,
        holderEmail: ticket.holderEmail,
        ticketTypeName: ticket.ticketType.name,
      },
    };
  }

  async findAllForEvent(organizationId: string, eventId: string) {
    await this.eventsService.findOneForOrganization(organizationId, eventId);
    return this.prisma.scan.findMany({
      where: { ticket: { ticketType: { eventId } } },
      orderBy: { scannedAt: 'desc' },
      include: {
        ticket: { include: { ticketType: true } },
        controller: { select: { id: true, fullName: true } },
      },
    });
  }

  private classifyResult(
    ticket: { status: TicketStatus; ticketType: { eventId: string; event: { status: EventStatus; endAt: Date } } },
    eventId: string,
  ): ScanResult {
    if (ticket.ticketType.eventId !== eventId) return ScanResult.INVALID;
    if (ticket.status === TicketStatus.USED) return ScanResult.ALREADY_USED;
    if (ticket.status !== TicketStatus.VALID) return ScanResult.INVALID;
    if (ticket.ticketType.event.status === EventStatus.CANCELLED) return ScanResult.INVALID;
    if (ticket.ticketType.event.endAt <= new Date()) return ScanResult.EXPIRED_EVENT;
    return ScanResult.INVALID;
  }
}
