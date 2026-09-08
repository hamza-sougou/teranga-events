import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DressCodeAudience, EventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { DressCodeEntryDto } from './dto/dress-code-entry.dto';
import { AdminEventsQueryDto } from './dto/admin-events-query.dto';
import { NotificationsService } from '../notifications/notifications.service';

// Maximum dress code entries per applies_to value — the three buckets
// (everyone/men/women) are independent, no cross-counting. Enforced here,
// deliberately not a SQL CHECK/trigger — see db/schema.sql section 4C.
const MAX_DRESS_CODE_ENTRIES_PER_AUDIENCE = 3;

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
  minAge: true,
  dressCodes: {
    select: { id: true, label: true, appliesTo: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  },
  startAt: true,
  endAt: true,
  media: {
    select: { id: true, type: true, url: true },
    orderBy: { createdAt: 'asc' },
  },
  // Organizer name for the "Organisé par" section — nothing else about the
  // organizer (avatar/followers/verification) exists as real data yet, the
  // frontend fills the rest with placeholders until a real profile module
  // exists.
  organization: {
    select: { name: true },
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
    this.assertDressCodeLimits(dto.dressCodes);
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
          minAge: dto.minAge,
          startAt: new Date(dto.startAt),
          endAt: new Date(dto.endAt),
          dressCodes: dto.dressCodes ? { create: this.buildDressCodeRows(dto.dressCodes) } : undefined,
        },
        include: { category: true, dressCodes: { orderBy: { sortOrder: 'asc' } } },
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

  // Super Admin moderation view (docs/SPEC.md §10.3) — cross-organization,
  // unlike findAllForOrganization above. Plain Prisma composition, no raw
  // SQL/pagination, same scale reasoning as OrganizationsService.findAllForSuperAdmin.
  findAllForSuperAdmin(filters: AdminEventsQueryDto) {
    const where: Prisma.EventWhereInput = {
      organizationId: filters.organizationId,
      status: filters.status,
      startAt:
        filters.from || filters.to
          ? { gte: filters.from ? new Date(filters.from) : undefined, lte: filters.to ? new Date(filters.to) : undefined }
          : undefined,
      ...(filters.q && {
        OR: [
          { name: { contains: filters.q, mode: 'insensitive' } },
          { organization: { name: { contains: filters.q, mode: 'insensitive' } } },
        ],
      }),
    };

    return this.prisma.event.findMany({
      where,
      orderBy: { startAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        startAt: true,
        endAt: true,
        category: { select: { label: true } },
        organization: { select: { id: true, name: true } },
      },
    });
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
      include: {
        category: true,
        media: { orderBy: { createdAt: 'asc' } },
        dressCodes: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async update(organizationId: string, eventId: string, dto: UpdateEventDto) {
    const event = await this.findOneForOrganization(organizationId, eventId);

    const startAt = dto.startAt ?? event.startAt.toISOString();
    const endAt = dto.endAt ?? event.endAt.toISOString();
    this.assertDateOrder(startAt, endAt);
    this.assertCoordinatesPaired(dto.latitude, dto.longitude);
    this.assertDressCodeLimits(dto.dressCodes);
    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }

    if (dto.status && dto.status !== event.status) {
      const allowed = ALLOWED_TRANSITIONS[event.status];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(`Cannot transition event from ${event.status} to ${dto.status}`);
      }

      // Publishing requires the full mandatory data set. All conditions are
      // collected before throwing (not fail-fast) so a caller — the wizard's
      // recap step in particular — gets every missing piece in one round
      // trip instead of fixing them one at a time. Extends the original
      // image-only rule; see docs/SPEC.md and db/schema.sql section 4B.
      if (dto.status === EventStatus.PUBLISHED) {
        const missingFields: string[] = [];
        const effectiveName = dto.name ?? event.name;
        const effectiveCategoryId = dto.categoryId ?? event.categoryId;
        const effectiveAddress = dto.address ?? event.address;

        if (!effectiveName) missingFields.push('name');
        if (!effectiveCategoryId) missingFields.push('category');
        if (!effectiveAddress) missingFields.push('address');

        const [imageCount, ticketTypeCount] = await Promise.all([
          this.prisma.eventMedia.count({ where: { eventId, type: 'IMAGE' } }),
          this.prisma.ticketType.count({ where: { eventId } }),
        ]);
        if (imageCount === 0) missingFields.push('media');
        if (ticketTypeCount === 0) missingFields.push('ticketTypes');

        if (missingFields.length > 0) {
          throw new BadRequestException({
            message: 'Cannot publish event: missing required fields',
            missingFields,
          });
        }
      }
    }

    // Set only on the DRAFT -> PUBLISHED transition itself, never touched
    // again afterwards (e.g. PUBLISHED -> COMPLETED must not overwrite it) —
    // see docs/SPEC.md §9.3.
    const isPublishing = dto.status === EventStatus.PUBLISHED && event.status !== EventStatus.PUBLISHED;

    let updated;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        await tx.event.update({
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
            minAge: dto.minAge,
            startAt: dto.startAt ? new Date(dto.startAt) : undefined,
            endAt: dto.endAt ? new Date(dto.endAt) : undefined,
            status: dto.status,
            publishedAt: isPublishing ? new Date() : undefined,
          },
        });

        // Whole-list replace, not a diff — the frontend always submits the
        // section's full current state in one go. Only touched when the
        // field is present at all (even empty), so callers that omit it
        // entirely leave the existing list untouched.
        if (dto.dressCodes !== undefined) {
          await tx.eventDressCode.deleteMany({ where: { eventId } });
          if (dto.dressCodes.length > 0) {
            await tx.eventDressCode.createMany({
              data: this.buildDressCodeRows(dto.dressCodes).map((row) => ({ ...row, eventId })),
            });
          }
        }

        return tx.event.findUniqueOrThrow({
          where: { id: eventId },
          include: { category: true, dressCodes: { orderBy: { sortOrder: 'asc' } } },
        });
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

  // Super Admin moderation (docs/SPEC.md §10.3) — "suspendre" and "annuler"
  // an event collapse into the same action: EventStatus has no separate
  // SUSPENDED value, and this deliberately reuses update()/ALLOWED_TRANSITIONS
  // as-is (same 400 on an already-terminal event, same publish-image rule,
  // same notifyEventCancelled) rather than a second transition path.
  async adminCancel(eventId: string, actorUserId: string, reason?: string) {
    const event = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const updated = await this.update(event.organizationId, eventId, { status: EventStatus.CANCELLED });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        organizationId: event.organizationId,
        action: 'event.admin_cancelled',
        entityType: 'event',
        entityId: eventId,
        metadata: reason ? { reason } : undefined,
      },
    });

    return updated;
  }

  async findPublicBySlug(slug: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        slug,
        status: { in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] },
        organization: { suspendedAt: null },
      },
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

  // Max 3 entries per applies_to value — everyone/men/women are independent
  // buckets, never counted against each other. Cosmetic constraint, not a
  // SQL CHECK/trigger — see db/schema.sql section 4C.
  private assertDressCodeLimits(entries?: DressCodeEntryDto[]) {
    if (!entries) return;
    const counts = new Map<DressCodeAudience, number>();
    for (const entry of entries) {
      const appliesTo = entry.appliesTo ?? DressCodeAudience.EVERYONE;
      const count = (counts.get(appliesTo) ?? 0) + 1;
      if (count > MAX_DRESS_CODE_ENTRIES_PER_AUDIENCE) {
        throw new BadRequestException(
          `Maximum ${MAX_DRESS_CODE_ENTRIES_PER_AUDIENCE} dress code entries for "${appliesTo}"`,
        );
      }
      counts.set(appliesTo, count);
    }
  }

  // Assigns sortOrder = position within its own applies_to group, in the
  // order the client sent them — the client never needs to compute it.
  private buildDressCodeRows(entries: DressCodeEntryDto[]) {
    const counters = new Map<DressCodeAudience, number>();
    return entries.map((entry) => {
      const appliesTo = entry.appliesTo ?? DressCodeAudience.EVERYONE;
      const sortOrder = counters.get(appliesTo) ?? 0;
      counters.set(appliesTo, sortOrder + 1);
      return { label: entry.label, appliesTo, sortOrder };
    });
  }
}
