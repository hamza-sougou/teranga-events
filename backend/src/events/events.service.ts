import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { NotificationsService } from '../notifications/notifications.service';

const ALLOWED_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  [EventStatus.DRAFT]: [EventStatus.PUBLISHED, EventStatus.CANCELLED],
  [EventStatus.PUBLISHED]: [EventStatus.CANCELLED, EventStatus.COMPLETED],
  [EventStatus.CANCELLED]: [],
  [EventStatus.COMPLETED]: [],
};

const PUBLIC_EVENT_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  venueName: true,
  address: true,
  category: true,
  startAt: true,
  endAt: true,
} satisfies Prisma.EventSelect;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(organizationId: string, userId: string, dto: CreateEventDto) {
    this.assertDateOrder(dto.startAt, dto.endAt);

    try {
      return await this.prisma.event.create({
        data: {
          organizationId,
          createdBy: userId,
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          venueName: dto.venueName,
          address: dto.address,
          category: dto.category,
          startAt: new Date(dto.startAt),
          endAt: new Date(dto.endAt),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Event slug already in use');
      }
      throw error;
    }
  }

  findAllForOrganization(organizationId: string) {
    return this.prisma.event.findMany({ where: { organizationId } });
  }

  async findOneForOrganization(organizationId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, organizationId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  async update(organizationId: string, eventId: string, dto: UpdateEventDto) {
    const event = await this.findOneForOrganization(organizationId, eventId);

    const startAt = dto.startAt ?? event.startAt.toISOString();
    const endAt = dto.endAt ?? event.endAt.toISOString();
    this.assertDateOrder(startAt, endAt);

    if (dto.status && dto.status !== event.status) {
      const allowed = ALLOWED_TRANSITIONS[event.status];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(`Cannot transition event from ${event.status} to ${dto.status}`);
      }
    }

    let updated;
    try {
      updated = await this.prisma.event.update({
        where: { id: eventId },
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          venueName: dto.venueName,
          address: dto.address,
          category: dto.category,
          startAt: dto.startAt ? new Date(dto.startAt) : undefined,
          endAt: dto.endAt ? new Date(dto.endAt) : undefined,
          status: dto.status,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Event slug already in use');
      }
      throw error;
    }

    // Guard on the *previous* status too — re-sending `status: CANCELLED`
    // on an already-cancelled event (a harmless no-op update) must not
    // re-notify every buyer a second time.
    if (dto.status === EventStatus.CANCELLED && event.status !== EventStatus.CANCELLED) {
      await this.notificationsService.notifyEventCancelled(eventId);
    }

    return updated;
  }

  async findPublicBySlug(slug: string) {
    const event = await this.prisma.event.findFirst({
      where: { slug, status: { in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] } },
      select: PUBLIC_EVENT_SELECT,
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  private assertDateOrder(startAt: string, endAt: string) {
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      throw new BadRequestException('endAt must be after startAt');
    }
  }
}
