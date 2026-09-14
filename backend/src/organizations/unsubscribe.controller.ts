import { Controller, Get, Query } from '@nestjs/common';
import { OrganizerProfileService } from './organizer-profile.service';

// Top-level route — the email link only carries the token, not the
// organization's slug, so this can't live under /organizers/:slug.
@Controller('unsubscribe')
export class UnsubscribeController {
  constructor(private readonly organizerProfileService: OrganizerProfileService) {}

  @Get()
  async unsubscribe(@Query('token') token?: string) {
    if (token) {
      await this.organizerProfileService.unsubscribeByToken(token);
    }
    return { success: true };
  }
}
