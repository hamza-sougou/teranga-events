import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NormalizedPlace {
  placeId: number;
  // Short label for the results list — never written into the Lieu field,
  // which the frontend fills from what the organizer actually typed instead.
  name: string;
  displayName: string;
  country: string;
  city: string;
  // Neighbourhood/district — written into Event.address (labeled "Quartier"
  // in the organizer form), never a street. Deliberately never falls back to
  // the full display_name (see normalize() below) — that produced the
  // "Voile d'or, Plage de la Voile d'Or, Commune de Hann Bel-Air,
  // Arrondissement de Grand Dakar, Dakar, Région de Dakar, Sénégal, Dakar,
  // Sénégal"-style unusably long address the participant page used to show.
  district: string;
  latitude: number;
  longitude: number;
}

// Interface a future GoogleGeocodingProvider implements the same way —
// swapping providers is then a one-line change in geocoding.module.ts,
// nothing else (controller/DTO/frontend untouched).
export interface GeocodingProvider {
  searchPlaces(query: string): Promise<NormalizedPlace[]>;
}

interface NominatimAddress {
  country?: string;
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  city_district?: string;
  neighbourhood?: string;
  quarter?: string;
  road?: string;
}

// Dakar-area communes/arrondissements come back from Nominatim with these
// French administrative prefixes baked into the field value itself (e.g.
// "Commune de Hann Bel-Air") — stripped for a plain neighbourhood name.
// Heuristic scoped to Senegal, consistent with the countrycodes=sn search
// param above; not guaranteed to cover every naming convention.
const ADMIN_PREFIX_PATTERN = /^(commune|arrondissement)\s+(de|d'|du|des)\s*/i;

function stripAdminPrefix(value: string): string {
  return value.replace(ADMIN_PREFIX_PATTERN, '').trim();
}

interface NominatimResult {
  place_id: number;
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
}

const REQUEST_TIMEOUT_MS = 8_000;
// Safety margin over Nominatim's ~1 req/s usage-policy limit.
const MIN_REQUEST_INTERVAL_MS = 1_100;
const RESULT_LIMIT = 8;

// Adapter around OpenStreetMap's Nominatim search API — isolated behind
// GeocodingProvider so a future swap to Google Maps in production only
// touches this file and geocoding.module.ts. All Nominatim requests must
// originate from the backend (never the browser), carry a descriptive
// User-Agent (Nominatim's usage policy requires it), and stay serialized to
// roughly one request per second combined across every concurrent caller —
// see the `schedule()` queue below.
@Injectable()
export class NominatimGeocodingProvider implements GeocodingProvider {
  constructor(private readonly configService: ConfigService) {}

  private queueTail: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;

  async searchPlaces(query: string): Promise<NormalizedPlace[]> {
    const results = await this.schedule(() => this.fetchFromNominatim(query));
    return results.map((result) => this.normalize(result));
  }

  // Serializes the actual outbound Nominatim calls across every concurrent
  // caller (this class is a Nest singleton, one instance per process) so the
  // combined request rate stays under Nominatim's ~1 req/s policy regardless
  // of how many organizers search at the same time. This is distinct from —
  // and not replaced by — the per-caller @Throttle on the controller, which
  // only caps a single caller's own rate. Known limitation: this pacing is
  // per-process; scaling the backend to multiple instances would need a
  // shared store (Redis, not wired into app logic today) to stay correct.
  private schedule<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queueTail.then(async () => {
      const waitMs = Math.max(0, this.lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now());
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      this.lastRequestAt = Date.now();
      return task();
    });
    // Advance the tail regardless of outcome — a failed/timed-out search must
    // never permanently wedge every request queued behind it.
    this.queueTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async fetchFromNominatim(query: string): Promise<NominatimResult[]> {
    const baseUrl = this.configService.get<string>('nominatim.baseUrl');
    const userAgent = this.configService.get<string>('nominatim.userAgent');

    const url = new URL('/search', baseUrl);
    url.searchParams.set('q', query);
    // jsonv2 (not the default v1) is required specifically for its top-level
    // `name` field, used for the results list — display_name alone is a
    // single unstructured string.
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'sn');
    url.searchParams.set('limit', String(RESULT_LIMIT));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': userAgent ?? '' },
        signal: controller.signal,
      });
    } catch {
      throw new ServiceUnavailableException('Geocoding service unavailable');
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ServiceUnavailableException('Geocoding service unavailable');
    }

    return response.json() as Promise<NominatimResult[]>;
  }

  private normalize(raw: NominatimResult): NormalizedPlace {
    const address = raw.address ?? {};
    const district = address.suburb ?? address.city_district ?? address.neighbourhood ?? address.quarter ?? '';
    return {
      placeId: raw.place_id,
      name: raw.name?.trim() || raw.display_name.split(',')[0].trim(),
      displayName: raw.display_name,
      country: address.country ?? '',
      city: address.city ?? address.town ?? address.village ?? address.suburb ?? '',
      district: district ? stripAdminPrefix(district) : '',
      latitude: parseFloat(raw.lat),
      longitude: parseFloat(raw.lon),
    };
  }
}
