import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { NominatimGeocodingProvider, NormalizedPlace } from '../src/geocoding/providers/nominatim-geocoding.provider';

describe('Geocoding (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let prisma: PrismaService;
  let nominatimProvider: NominatimGeocodingProvider;
  const createdUserEmails: string[] = [];

  const mockResults: NormalizedPlace[] = [
    {
      placeId: 12345,
      name: 'Terrou-Bi',
      displayName: 'Terrou-Bi, Route de la Corniche Ouest, Dakar, Sénégal',
      country: 'Sénégal',
      city: 'Dakar',
      district: 'Fann Résidence',
      latitude: 14.6872,
      longitude: -17.4781,
    },
  ];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    authService = moduleFixture.get(AuthService);
    prisma = moduleFixture.get(PrismaService);
    nominatimProvider = moduleFixture.get(NominatimGeocodingProvider);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    for (const email of createdUserEmails) {
      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) continue;
      await prisma.organization.deleteMany({ where: { ownerUserId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
  });

  async function registerUser() {
    const unique = randomUUID();
    const email = `geocode-${unique}@example.com`;
    createdUserEmails.push(email);

    const { accessToken } = await authService.register({
      email,
      password: 'super-secret-password',
      fullName: 'Amadou Ba',
      organizationName: 'Amadou Events',
      organizationSlug: `amadou-events-${unique}`,
    });

    return accessToken;
  }

  it('rejects an unauthenticated request with 401', async () => {
    const spy = jest.spyOn(nominatimProvider, 'searchPlaces').mockResolvedValue(mockResults);

    await request(app.getHttpServer()).get('/geocode/search').query({ q: 'Dakar' }).expect(401);

    expect(spy).not.toHaveBeenCalled();
  });

  it('returns the provider normalized results for an authenticated caller', async () => {
    const accessToken = await registerUser();
    jest.spyOn(nominatimProvider, 'searchPlaces').mockResolvedValueOnce(mockResults);

    const res = await request(app.getHttpServer())
      .get('/geocode/search')
      .query({ q: 'Terrou-Bi Dakar' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toEqual(mockResults);
  });

  it('rejects a query shorter than 2 characters with 400', async () => {
    const accessToken = await registerUser();
    const spy = jest.spyOn(nominatimProvider, 'searchPlaces').mockResolvedValue(mockResults);

    await request(app.getHttpServer())
      .get('/geocode/search')
      .query({ q: 'a' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);

    expect(spy).not.toHaveBeenCalled();
  });
});
