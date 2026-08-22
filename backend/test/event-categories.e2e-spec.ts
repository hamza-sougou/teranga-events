import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('EventCategories (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the 8 seeded categories sorted by sortOrder, without a token', async () => {
    const res = await request(app.getHttpServer()).get('/event-categories').expect(200);

    expect(res.body).toHaveLength(8);
    expect(res.body.map((c: { slug: string }) => c.slug)).toEqual([
      'concert',
      'festival',
      'soiree',
      'ceremonie',
      'theatre',
      'conference',
      'sport',
      'autre',
    ]);
    expect(res.body.every((c: { isActive: boolean }) => c.isActive)).toBe(true);
  });
});
