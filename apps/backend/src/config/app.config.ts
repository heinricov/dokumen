import { registerAs } from '@nestjs/config';

function normalizeOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return [...new Set(origins)];
}

export const appConfig = registerAs('app', () => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const corsOrigins = normalizeOrigins(process.env.CORS_ORIGINS);

  if (nodeEnv === 'production' && corsOrigins.length === 0) {
    throw new Error(
      'CORS_ORIGINS must be set (comma-separated allowlist) in production. ' +
        'Refusing to start with an open CORS policy.',
    );
  }

  return {
    nodeEnv,
    port: Number(process.env.BACKEND_PORT ?? process.env.PORT ?? 4000),
    corsOrigins:
      corsOrigins.length > 0 ? corsOrigins : ['http://localhost:5173'],
  };
});
