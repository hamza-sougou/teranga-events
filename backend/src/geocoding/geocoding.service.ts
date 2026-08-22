import { Injectable } from '@nestjs/common';
import { NominatimGeocodingProvider, NormalizedPlace } from './providers/nominatim-geocoding.provider';

@Injectable()
export class GeocodingService {
  constructor(private readonly provider: NominatimGeocodingProvider) {}

  search(query: string): Promise<NormalizedPlace[]> {
    return this.provider.searchPlaces(query);
  }
}
