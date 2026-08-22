import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GeocodingService } from './geocoding.service';
import { SearchPlacesQueryDto } from './dto/search-places-query.dto';

// Login required (any authenticated user, not organization-scoped) — its
// only consumer today is the organizer event form. Not public, to avoid
// anonymous traffic eating into the shared 1 req/s Nominatim budget.
@Controller('geocode')
@UseGuards(JwtAuthGuard)
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Get('search')
  // Defensive per-caller cap only — the actual ~1 req/s pacing to Nominatim
  // itself is enforced inside NominatimGeocodingProvider, not here.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  search(@Query() query: SearchPlacesQueryDto) {
    return this.geocodingService.search(query.q);
  }
}
