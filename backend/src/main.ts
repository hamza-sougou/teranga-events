import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const configService = app.get(ConfigService);

  const sentryDsn = configService.get<string>('sentry.dsn');
  if (sentryDsn) {
    Sentry.init({ dsn: sentryDsn, environment: process.env.NODE_ENV ?? 'development' });
  } else {
    logger.warn('SENTRY_DSN not set — error tracking disabled', 'Bootstrap');
  }

  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: configService.get<string[]>('corsOrigins'),
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(configService.get<number>('port') ?? 3000);
}
bootstrap();
