import { Module } from '@nestjs/common';
import { GeocodingController } from './geocoding.controller';
import { GeocodingService } from './geocoding.service';
import { NominatimGeocodingProvider } from './providers/nominatim-geocoding.provider';

@Module({
  controllers: [GeocodingController],
  providers: [GeocodingService, NominatimGeocodingProvider],
  // Exported so tests (e.g. events.e2e-spec.ts) can jest.spyOn it if ever needed.
  exports: [NominatimGeocodingProvider],
})
export class GeocodingModule {}
