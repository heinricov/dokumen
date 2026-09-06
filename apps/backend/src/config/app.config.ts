import { registerAs } from '@nestjs/config';

const DEFAULT_PORT = 4000;

const DEFAULT_DEV_CORS_ORIGINS = ['http://localhost:5173'];

/**
 * Normalize comma-separated CORS origins.
 */
function normalizeOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return [
    ...new Set(
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  ];
}

/**
 * Validate that a CORS origin is a
 * valid HTTP/HTTPS origin.
 */
function validateOrigin(origin: string): string {
  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    throw new Error(`Invalid CORS origin "${origin}".`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `Invalid CORS origin "${origin}". Only HTTP and HTTPS origins are allowed.`,
    );
  }

  /**
   * Origin must not contain path,
   * query string, or hash.
   */
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      `Invalid CORS origin "${origin}". Use only scheme, host, and optional port.`,
    );
  }

  if (!url.hostname) {
    throw new Error(`Invalid CORS origin "${origin}".`);
  }

  return origin;
}

/**
 * Parse and validate port.
 */
function resolvePort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid backend port "${value}". Port must be between 1 and 65535.`,
    );
  }

  return port;
}

export const appConfig = registerAs('app', () => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  const rawCorsOrigins = normalizeOrigins(process.env.CORS_ORIGINS);

  /**
   * Production must explicitly define
   * CORS allowlist.
   */
  if (nodeEnv === 'production' && rawCorsOrigins.length === 0) {
    throw new Error(
      'CORS_ORIGINS must be set in production. Refusing to start with an open CORS policy.',
    );
  }

  const corsOrigins =
    rawCorsOrigins.length > 0
      ? rawCorsOrigins.map(validateOrigin)
      : [...DEFAULT_DEV_CORS_ORIGINS];

  /**
   * BACKEND_PORT takes precedence over
   * PORT, matching the previous behavior.
   */
  const port = resolvePort(process.env.BACKEND_PORT ?? process.env.PORT);

  return {
    nodeEnv,

    port,

    corsOrigins,

    /**
     * Useful for conditional security
     * configuration elsewhere.
     */
    isProduction: nodeEnv === 'production',

    isDevelopment: nodeEnv === 'development',

    isTest: nodeEnv === 'test',
  };
});
