import { Params } from 'nestjs-pino';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// JSON logs in production (parseable by any log aggregator), pretty-printed
// in dev, silenced in the e2e suite (87 tests otherwise drown in per-request
// log lines). Redact list is a defensive baseline for structured log calls —
// see the manual audit in PaymentsService/PayoutsService for the actual
// secret-leak check (they only ever log plain strings/amounts today, never
// raw provider payloads or API keys).
export const loggerOptions: Params = {
  pinoHttp: {
    level: isTest ? 'silent' : isProduction ? 'info' : 'debug',
    transport: isProduction
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.token',
        'req.body.hash',
        '*.rawResponse',
        '*.masterKey',
        '*.privateKey',
        '*.password',
      ],
      remove: true,
    },
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
  },
};
