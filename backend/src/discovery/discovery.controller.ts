import { Controller, Get, Param, Query } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import { DiscoveryQueryDto } from './dto/discovery-query.dto';
import { NearMeQueryDto } from './dto/near-me-query.dto';

// Public, no guard — homepage sections, same pattern as
// PublicEventsController/EventCategoriesController. One route per section
// (docs/SPEC.md §9) so a slow/erroring section — "near-me" without
// geolocation, in particular — never blocks the other 8.
@Controller('discover')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('trending')
  trending(@Query() query: DiscoveryQueryDto) {
    return this.discoveryService.trending(query.limit);
  }

  @Get('this-weekend')
  thisWeekend(@Query() query: DiscoveryQueryDto) {
    return this.discoveryService.thisWeekend(query.limit);
  }

  @Get('near-me')
  nearMe(@Query() query: NearMeQueryDto) {
    return this.discoveryService.nearMe(query.lat, query.lng, query.radiusKm, query.limit);
  }

  @Get('sponsored')
  sponsored(@Query() query: DiscoveryQueryDto) {
    return this.discoveryService.sponsored(query.limit);
  }

  @Get('recently-published')
  recentlyPublished(@Query() query: DiscoveryQueryDto) {
    return this.discoveryService.recentlyPublished(query.limit);
  }

  @Get('by-category/:categorySlug')
  byCategory(@Param('categorySlug') categorySlug: string, @Query() query: DiscoveryQueryDto) {
    return this.discoveryService.byCategory(categorySlug, query.limit);
  }

  @Get('last-chance')
  lastChance(@Query() query: DiscoveryQueryDto) {
    return this.discoveryService.lastChance(query.limit);
  }

  @Get('free')
  free(@Query() query: DiscoveryQueryDto) {
    return this.discoveryService.free(query.limit);
  }
}
