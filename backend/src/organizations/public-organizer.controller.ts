import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrganizerProfileService } from './organizer-profile.service';
import { SubscribeOrganizerDto } from './dto/subscribe-organizer.dto';
import { ContactOrganizerDto } from './dto/contact-organizer.dto';
import { PublicOrganizerEventsQueryDto } from './dto/public-organizer-events-query.dto';

// Public profile (/organizers/[slug] on the web frontend) — no guard, no
// :organizationId param, resolved by slug instead. Replaces the fictional
// data in web/src/components/public/organizer-panel.tsx.
@Controller('organizers')
export class PublicOrganizerController {
  constructor(private readonly organizerProfileService: OrganizerProfileService) {}

  @Get(':slug')
  findProfile(@Param('slug') slug: string) {
    return this.organizerProfileService.findPublicProfile(slug);
  }

  @Get(':slug/events')
  findEvents(@Param('slug') slug: string, @Query() query: PublicOrganizerEventsQueryDto) {
    return this.organizerProfileService.findPublicEvents(slug, query);
  }

  // No email verification/confirmation step by design (see CLAUDE.md /
  // PROGRESS.md decision) — a lighter throttle than contact() below since
  // this only ever writes to the DB, never sends an email synchronously.
  @Post(':slug/subscribe')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async subscribe(@Param('slug') slug: string, @Body() dto: SubscribeOrganizerDto) {
    await this.organizerProfileService.subscribe(slug, dto.email);
    return { success: true };
  }

  @Post(':slug/unsubscribe')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async unsubscribe(@Param('slug') slug: string, @Body() dto: SubscribeOrganizerDto) {
    await this.organizerProfileService.unsubscribeByEmail(slug, dto.email);
    return { success: true };
  }

  // Public, unauthenticated, sends a real email to the organizer — stricter
  // throttle than subscribe/unsubscribe, same value as auth's resend-code
  // endpoints (the closest existing precedent for a spam-prone public route).
  @Post(':slug/contact')
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  async contact(@Param('slug') slug: string, @Body() dto: ContactOrganizerDto) {
    await this.organizerProfileService.contact(slug, dto);
    return { success: true };
  }
}
