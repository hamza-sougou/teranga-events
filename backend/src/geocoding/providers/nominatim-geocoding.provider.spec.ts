import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NominatimGeocodingProvider } from './nominatim-geocoding.provider';

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

function rawResult(overrides: Record<string, unknown> = {}) {
  return {
    place_id: 12345,
    name: 'Terrou-Bi',
    display_name: 'Terrou-Bi, Route de la Corniche Ouest, Dakar, Sénégal',
    lat: '14.687200',
    lon: '-17.478100',
    address: {
      country: 'Sénégal',
      city: 'Dakar',
      road: 'Route de la Corniche Ouest',
    },
    ...overrides,
  };
}

describe('NominatimGeocodingProvider', () => {
  let configService: { get: jest.Mock };
  let provider: NominatimGeocodingProvider;
  let fetchSpy: jest.SpiedFunction<typeof global.fetch>;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) =>
        key === 'nominatim.baseUrl' ? 'https://nominatim.openstreetmap.org' : 'ZenEvents/1.0 (sougouhamza@gmail.com)',
      ),
    };
    provider = new NominatimGeocodingProvider(configService as unknown as ConfigService);
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse([rawResult()]));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls Nominatim with countrycodes=sn, addressdetails=1, format=jsonv2 and the configured User-Agent', async () => {
    await provider.searchPlaces('Terrou-Bi Dakar');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [urlArg, init] = fetchSpy.mock.calls[0];
    const url = new URL(urlArg as unknown as string);
    expect(url.searchParams.get('q')).toBe('Terrou-Bi Dakar');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('addressdetails')).toBe('1');
    expect(url.searchParams.get('countrycodes')).toBe('sn');
    expect((init as RequestInit).headers).toMatchObject({
      'User-Agent': 'ZenEvents/1.0 (sougouhamza@gmail.com)',
    });
  });

  it.each([
    ['city', { city: 'Dakar', town: undefined, village: undefined, suburb: undefined }, 'Dakar'],
    ['town', { city: undefined, town: 'Mbour', village: undefined, suburb: undefined }, 'Mbour'],
    ['village', { city: undefined, town: undefined, village: 'Popenguine', suburb: undefined }, 'Popenguine'],
    ['suburb', { city: undefined, town: undefined, village: undefined, suburb: 'Sacré-Coeur' }, 'Sacré-Coeur'],
  ])('falls back city to %s when higher-priority fields are absent', async (_label, addressOverrides, expected) => {
    fetchSpy.mockResolvedValue(
      jsonResponse([rawResult({ address: { country: 'Sénégal', road: 'Route X', ...addressOverrides } })]),
    );

    const [result] = await provider.searchPlaces('query');
    expect(result.city).toBe(expected);
  });

  it('returns an empty city when none of city/town/village/suburb are present', async () => {
    fetchSpy.mockResolvedValue(jsonResponse([rawResult({ address: { country: 'Sénégal', road: 'Route X' } })]));

    const [result] = await provider.searchPlaces('query');
    expect(result.city).toBe('');
  });

  it('returns an empty district rather than falling back to display_name when no neighbourhood field is present', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse([
        rawResult({
          display_name: 'Plage de la Voile d\'Or, Commune de Hann Bel-Air, Arrondissement de Grand Dakar, Dakar, Région de Dakar, Sénégal',
          address: { country: 'Sénégal', city: 'Dakar', road: undefined },
        }),
      ]),
    );

    const [result] = await provider.searchPlaces('query');
    expect(result.district).toBe('');
  });

  it.each([
    ['suburb', { suburb: 'Commune de Hann Bel-Air' }, 'Hann Bel-Air'],
    ['city_district', { city_district: "Arrondissement d'Almadies" }, 'Almadies'],
    ['neighbourhood', { neighbourhood: 'Sacré-Coeur 3' }, 'Sacré-Coeur 3'],
    ['quarter', { quarter: 'Point E' }, 'Point E'],
  ])('derives district from %s, stripping French admin prefixes', async (_label, addressOverrides, expected) => {
    fetchSpy.mockResolvedValue(
      jsonResponse([rawResult({ address: { country: 'Sénégal', city: 'Dakar', ...addressOverrides } })]),
    );

    const [result] = await provider.searchPlaces('query');
    expect(result.district).toBe(expected);
  });

  it('prioritizes suburb over city_district/neighbourhood/quarter when several are present', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse([
        rawResult({
          address: {
            country: 'Sénégal',
            city: 'Dakar',
            suburb: 'Commune de Hann Bel-Air',
            city_district: 'Grand Dakar',
            neighbourhood: 'Other',
            quarter: 'Other',
          },
        }),
      ]),
    );

    const [result] = await provider.searchPlaces('query');
    expect(result.district).toBe('Hann Bel-Air');
  });

  it('parses lat/lon strings into numbers', async () => {
    fetchSpy.mockResolvedValue(jsonResponse([rawResult({ lat: '14.716677', lon: '-17.467686' })]));

    const [result] = await provider.searchPlaces('query');
    expect(result.latitude).toBe(14.716677);
    expect(result.longitude).toBe(-17.467686);
    expect(typeof result.latitude).toBe('number');
    expect(typeof result.longitude).toBe('number');
  });

  it('falls back name to the first display_name segment when name is empty', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse([rawResult({ name: '', display_name: 'Quelque part, Dakar, Sénégal' })]),
    );

    const [result] = await provider.searchPlaces('query');
    expect(result.name).toBe('Quelque part');
  });

  it('throws ServiceUnavailableException when Nominatim responds non-OK', async () => {
    fetchSpy.mockResolvedValue({ ok: false, json: async () => [] } as unknown as Response);
    await expect(provider.searchPlaces('query')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws ServiceUnavailableException when fetch rejects', async () => {
    fetchSpy.mockRejectedValue(new Error('network error'));
    await expect(provider.searchPlaces('query')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('paces two concurrent calls so the second fetch does not fire until ~1.1s after the first', async () => {
    jest.useFakeTimers();
    try {
      const first = provider.searchPlaces('first');
      const second = provider.searchPlaces('second');

      // Let the first call's fetch fire before asserting only one happened so far.
      await jest.advanceTimersByTimeAsync(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Just short of the pacing window — the second call must still be waiting.
      await jest.advanceTimersByTimeAsync(1000);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Cross the 1.1s pacing threshold — the second fetch may now fire.
      await jest.advanceTimersByTimeAsync(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      await Promise.all([first, second]);
    } finally {
      jest.useRealTimers();
    }
  });
});
