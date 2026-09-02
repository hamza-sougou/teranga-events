import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { loggerOptions } from './config/logger.config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { TeamsModule } from './teams/teams.module';
import { EventsModule } from './events/events.module';
import { EventCategoriesModule } from './event-categories/event-categories.module';
import { TicketTypesModule } from './ticket-types/ticket-types.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PayoutsModule } from './payouts/payouts.module';
import { TicketsModule } from './tickets/tickets.module';
import { ScanModule } from './scan/scan.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StatsModule } from './stats/stats.module';
import { StorageModule } from './storage/storage.module';
import { EventMediaModule } from './event-media/event-media.module';
import { GeocodingModule } from './geocoding/geocoding.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { AdminFinanceModule } from './admin-finance/admin-finance.module';

const isTestEnv = process.env.NODE_ENV === 'test';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    LoggerModule.forRoot(loggerOptions),
    ScheduleModule.forRoot(),
    // Generous global default (protects against genuine abuse); the
    // sensitive endpoints (auth, checkout) carry their own tighter
    // @Throttle(...) override. Disabled entirely under NODE_ENV=test — the
    // e2e suite calls these routes dozens of times per file (registerOrganizer()
    // etc.), and no threshold tuned for that traffic would still mean
    // anything in production.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    TeamsModule,
    EventsModule,
    EventCategoriesModule,
    TicketTypesModule,
    OrdersModule,
    PaymentsModule,
    PayoutsModule,
    TicketsModule,
    ScanModule,
    NotificationsModule,
    StatsModule,
    StorageModule,
    EventMediaModule,
    GeocodingModule,
    DiscoveryModule,
    AdminFinanceModule,
  ],
  providers: isTestEnv ? [] : [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
