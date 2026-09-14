import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailChannel } from '../notifications/channels/email.channel';
import { PricingService } from '../payments/pricing/pricing.service';
import { EVENT_CARD_SELECT, toEventCard } from '../discovery/event-card.mapper';
import { EventCardDto } from '../discovery/dto/event-card.dto';
import { ContactOrganizerDto } from './dto/contact-organizer.dto';
import { PublicOrganizerEventsQueryDto } from './dto/public-organizer-events-query.dto';

const DEFAULT_LIST_LIMIT = 20;

const PUBLISHED_OR_COMPLETED = { in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] };

@Injectable()
export class OrganizerProfileService {
  private readonly logger = new Logger(OrganizerProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailChannel: EmailChannel,
    private readonly pricingService: PricingService,
  ) {}

  // A suspended organization is treated as not found everywhere public
  // (discovery, /events/:slug, checkout — see event-card.mapper.ts
  // NOT_SUSPENDED) — the public profile follows the same rule, never a
  // distinct error that would reveal the suspension.
  private async findActiveOrganizationBySlug(slug: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { slug, suspendedAt: null },
    });
    if (!organization) throw new NotFoundException('Organizer not found');
    return organization;
  }

  async findPublicProfile(slug: string) {
    const organization = await this.findActiveOrganizationBySlug(slug);
    const publishedEventCount = await this.prisma.event.count({
      where: { organizationId: organization.id, status: PUBLISHED_OR_COMPLETED },
    });

    // Subscriber count deliberately not exposed here — a low number would
    // discourage a new organizer more than a high one would build trust.
    return {
      slug: organization.slug,
      name: organization.name,
      isVerified: organization.isVerified,
      publishedEventCount,
      avatarUrl: organization.avatarImageUrl,
      coverUrl: organization.coverImageUrl,
      bio: organization.bio,
    };
  }

  async findPublicEvents(
    slug: string,
    query: PublicOrganizerEventsQueryDto,
  ): Promise<{ items: EventCardDto[]; total: number; page: number; limit: number }> {
    const organization = await this.findActiveOrganizationBySlug(slug);
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_LIST_LIMIT;
    const now = new Date();
    const isUpcoming = query.when === 'upcoming';

    const where: Prisma.EventWhereInput = {
      organizationId: organization.id,
      status: PUBLISHED_OR_COMPLETED,
      startAt: isUpcoming ? { gte: now } : { lt: now },
    };

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { startAt: isUpcoming ? 'asc' : 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: EVENT_CARD_SELECT,
      }),
      this.prisma.event.count({ where }),
    ]);

    return { items: events.map((event) => toEventCard(event, this.pricingService)), total, page, limit };
  }

  async subscribe(slug: string, email: string): Promise<void> {
    const organization = await this.findActiveOrganizationBySlug(slug);
    try {
      await this.prisma.organizerSubscription.create({
        data: { organizationId: organization.id, email: email.toLowerCase() },
      });
    } catch (error) {
      // Already subscribed — subscribing a second time must never surface
      // as a visible error to the caller.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
  }

  // No suspended-organization check on purpose: unsubscribing must always
  // work even if the organization was suspended after the subscription was
  // created. Always resolves — never reveals whether the organization or
  // the email was actually subscribed.
  async unsubscribeByEmail(slug: string, email: string): Promise<void> {
    const organization = await this.prisma.organization.findUnique({ where: { slug } });
    if (!organization) return;
    await this.prisma.organizerSubscription.deleteMany({
      where: { organizationId: organization.id, email: email.toLowerCase() },
    });
  }

  async unsubscribeByToken(token: string): Promise<void> {
    try {
      await this.prisma.organizerSubscription.deleteMany({ where: { id: token } });
    } catch {
      // Malformed/garbage token (not even a valid UUID) — same idempotent
      // outcome as a valid but already-used one.
    }
  }

  async contact(slug: string, dto: ContactOrganizerDto): Promise<void> {
    const organization = await this.findActiveOrganizationBySlug(slug);
    // No contactEmail configured is treated the same as "not found" — never
    // a distinct error that reveals an organizer's configuration state.
    if (!organization.contactEmail) throw new NotFoundException('Organizer not found');

    try {
      await this.emailChannel.send({
        to: organization.contactEmail,
        subject: `[Contact via Zen Events] ${dto.subject}`,
        text: `De : ${dto.name} <${dto.email}>\n\n${dto.message}`,
      });
    } catch (error) {
      // Fire-and-forget: an SMTP failure must never surface a distinct error
      // to the public caller (would leak the organizer's email config state).
      this.logger.error(`Failed to send contact email for organization ${organization.id}: ${(error as Error).message}`);
    }
  }
}
