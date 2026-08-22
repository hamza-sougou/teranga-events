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
  country: true,
  city: true,
  latitude: true,
  longitude: true,
  category: {
    select: { id: true, slug: true, label: true, icon: true, colorToken: true },
  },
  startAt: true,
  endAt: true,
  media: {
    select: { id: true, type: true, url: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.EventSelect;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(organizationId: string, userId: string, dto: CreateEventDto) {
    this.assertDateOrder(dto.startAt, dto.endAt);
    this.assertCoordinatesPaired(dto.latitude, dto.longitude);
    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }

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
          country: dto.country ?? 'Sénégal',
          city: dto.city,
          latitude: dto.latitude,
          longitude: dto.longitude,
          categoryId: dto.categoryId,
          startAt: new Date(dto.startAt),
          endAt: new Date(dto.endAt),
        },
        include: { category: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Event slug already in use');
      }
      throw error;
    }
  }

  findAllForOrganization(organizationId: string) {
    return this.prisma.event.findMany({ where: { organizationId }, include: { category: true } });
  }

  async findOneForOrganization(organizationId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, organizationId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  // Separate from findOneForOrganization on purpose: that method is the lean
  // existence/ownership check reused by every mutating method in this module
  // and in TicketTypesService/EventMediaService — adding a media join there
  // would join media on every ticket-type or media create/update too. This
  // one backs only the organizer detail view (GET .../events/:eventId).
  async findDetailForOrganization(organizationId: string, eventId: string) {
    await this.findOneForOrganization(organizationId, eventId);
    return this.prisma.event.findFirst({
      where: { id: eventId, organizationId },
      include: { category: true, media: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async update(organizationId: string, eventId: string, dto: UpdateEventDto) {
    const event = await this.findOneForOrganization(organizationId, eventId);

    const startAt = dto.startAt ?? event.startAt.toISOString();
    const endAt = dto.endAt ?? event.endAt.toISOString();
    this.assertDateOrder(startAt, endAt);
    this.assertCoordinatesPaired(dto.latitude, dto.longitude);
    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }

    if (dto.status && dto.status !== event.status) {
      const allowed = ALLOWED_TRANSITIONS[event.status];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(`Cannot transition event from ${event.status} to ${dto.status}`);
      }

      // At least one image is required to publish — never for a draft.
      // See docs/SPEC.md and db/schema.sql section 4B.
      if (dto.status === EventStatus.PUBLISHED) {
        const imageCount = await this.prisma.eventMedia.count({
          where: { eventId, type: 'IMAGE' },
        });
        if (imageCount === 0) {
          throw new BadRequestException('At least one image is required to publish an event');
        }
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
          country: dto.country,
          city: dto.city,
          latitude: dto.latitude,
          longitude: dto.longitude,
          categoryId: dto.categoryId,
          startAt: dto.startAt ? new Date(dto.startAt) : undefined,
          endAt: dto.endAt ? new Date(dto.endAt) : undefined,
          status: dto.status,
        },
        include: { category: true },
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

  // Application-level twin of chk_events_lat_lng_paired (db/schema.sql) —
  // gives a clean 400 instead of a raw Postgres constraint-violation error.
  private assertCoordinatesPaired(latitude?: number, longitude?: number) {
    if ((latitude == null) !== (longitude == null)) {
      throw new BadRequestException('latitude and longitude must be provided together');
    }
  }

  private async assertCategoryExists(categoryId: string) {
    const category = await this.prisma.eventCategory.findUnique({ where: { id: categoryId } });
    if (!category) {
      throw new BadRequestException('Unknown categoryId');
    }
  }
}
