export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL,
  },
  paydunya: {
    masterKey: process.env.PAYDUNYA_MASTER_KEY,
    privateKey: process.env.PAYDUNYA_PRIVATE_KEY,
    publicKey: process.env.PAYDUNYA_PUBLIC_KEY,
    token: process.env.PAYDUNYA_TOKEN,
    mode: process.env.PAYDUNYA_MODE ?? 'test',
    callbackUrl: process.env.PAYDUNYA_CALLBACK_URL,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    fromEmail: process.env.SMTP_FROM_EMAIL,
  },
  frontendUrl: process.env.FRONTEND_URL,
  // Comma-separated allow-list — falls back to just FRONTEND_URL so a
  // fresh checkout of this repo (only FRONTEND_URL set) still has a
  // correctly-scoped CORS policy rather than an accidental wildcard.
  corsOrigins: (process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  sentry: {
    dsn: process.env.SENTRY_DSN,
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET_NAME,
    publicUrl: process.env.R2_PUBLIC_URL,
  },
  nominatim: {
    baseUrl: process.env.NOMINATIM_BASE_URL ?? 'https://nominatim.openstreetmap.org',
    // Nominatim's usage policy requires a User-Agent identifying the app and
    // a way to reach its operator — see docs/INFRASTRUCTURE.md and
    // backend/src/geocoding/.
    userAgent: process.env.NOMINATIM_USER_AGENT ?? 'ZenEvents/1.0 (sougouhamza@gmail.com)',
  },
});
