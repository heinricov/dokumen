import { z } from 'zod';
import { parseDurationToMs } from './duration.util';

/**
 * Non-empty string helper.
 */
// const requiredString = z.string().trim().min(1);

/**
 * Validate duration strings used by JWT configuration.
 *
 * Supported:
 * - 500ms
 * - 30s
 * - 15m
 * - 12h
 * - 30d
 */
const durationSchema = z.string().refine(
  (value) => {
    try {
      parseDurationToMs(value);
      return true;
    } catch {
      return false;
    }
  },
  {
    message: 'Invalid duration format. Use e.g. "15m", "30d".',
  },
);

/**
 * Port must be an integer between
 * 1 and 65535.
 */
const portSchema = z.coerce.number().int().min(1).max(65535);

/**
 * DATABASE_URL is optional individually because
 * the application supports multiple names:
 *
 * DATABASE_URL
 * PRISMA_DATABASE_URL
 * POSTGRES_URL
 *
 * The actual requirement is handled below:
 * at least one must exist.
 */
const databaseUrlSchema = z.string().trim().min(1).optional();

/**
 * CORS origins are stored as a comma-separated
 * environment variable.
 *
 * Example:
 *
 * CORS_ORIGINS=http://localhost:5173,https://example.com
 */
const corsOriginsSchema = z.string().trim().optional();

/**
 * JWT secret validation.
 *
 * 32 characters is a more reasonable minimum
 * for a production signing secret than the old
 * 16-character minimum.
 */
const jwtSecretSchema = z
  .string()
  .min(32, 'JWT_SECRET must be at least 32 characters long.')
  .refine(
    (value) => {
      const normalized = value.trim().toLowerCase();

      const weakSecrets = [
        'development-secret',
        'jwt-secret',
        'secret',
        'password',
        'changeme',
        'change-me',
        'your-secret',
        'your-jwt-secret',
        'replace-me',
        'replace-this',
      ];

      return !weakSecrets.includes(normalized);
    },
    {
      message: 'JWT_SECRET must not use a known default/example secret value.',
    },
  );

export const envSchema = z
  .object({
    /**
     * Runtime environment.
     */
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),

    /**
     * HTTP port.
     */
    BACKEND_PORT: portSchema.optional(),

    /**
     * Some deployment platforms expose
     * PORT instead of BACKEND_PORT.
     */
    PORT: portSchema.optional(),

    /**
     * Database connection.
     *
     * The application supports these aliases:
     *
     * DATABASE_URL
     * PRISMA_DATABASE_URL
     * POSTGRES_URL
     */
    DATABASE_URL: databaseUrlSchema,

    PRISMA_DATABASE_URL: databaseUrlSchema,

    POSTGRES_URL: databaseUrlSchema,

    /**
     * JWT secret.
     */
    JWT_SECRET: jwtSecretSchema,

    /**
     * JWT lifetimes.
     */
    JWT_EXPIRES_IN: durationSchema.default('15m'),

    JWT_REFRESH_EXPIRES_IN: durationSchema.default('30d'),

    JWT_RESET_EXPIRES_IN: durationSchema.default('15m'),

    /**
     * Comma-separated CORS origins.
     */
    CORS_ORIGINS: corsOriginsSchema,
  })
  .superRefine((env, ctx) => {
    /**
     * ==========================================
     * DATABASE
     * ==========================================
     */
    const hasDatabaseUrl = Boolean(
      env.DATABASE_URL || env.PRISMA_DATABASE_URL || env.POSTGRES_URL,
    );

    if (!hasDatabaseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message:
          'At least one of DATABASE_URL, PRISMA_DATABASE_URL, or POSTGRES_URL must be configured.',
      });
    }

    /**
     * ==========================================
     * PORT
     * ==========================================
     */
    if (
      env.BACKEND_PORT !== undefined &&
      env.PORT !== undefined &&
      env.BACKEND_PORT !== env.PORT
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BACKEND_PORT'],
        message: 'BACKEND_PORT and PORT must match when both are configured.',
      });
    }

    /**
     * ==========================================
     * CORS
     * ==========================================
     */
    const corsOrigins =
      env.CORS_ORIGINS?.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean) ?? [];

    /**
     * Production MUST explicitly define
     * its CORS allowlist.
     */
    if (env.NODE_ENV === 'production' && corsOrigins.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS must be configured in production.',
      });
    }

    /**
     * Validate every CORS origin.
     *
     * We intentionally do not accept:
     *
     * https://example.com/path
     * https://example.com/?foo=bar
     *
     * because CORS origin only consists of
     * scheme + host + optional port.
     */
    for (const origin of corsOrigins) {
      try {
        const url = new URL(origin);

        const isHttp = url.protocol === 'http:' || url.protocol === 'https:';

        const hasPath =
          url.pathname !== '/' || url.search.length > 0 || url.hash.length > 0;

        if (!isHttp || hasPath || !url.hostname) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['CORS_ORIGINS'],
            message: `Invalid CORS origin: "${origin}". Use an origin such as "https://example.com".`,
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: `Invalid CORS origin: "${origin}".`,
        });
      }
    }

    /**
     * ==========================================
     * PRODUCTION JWT SECRET
     * ==========================================
     *
     * The minimum length is already enforced
     * by jwtSecretSchema.
     *
     * Production gets an additional check
     * against whitespace-only / accidental
     * values.
     */
    if (env.NODE_ENV === 'production' && env.JWT_SECRET.trim().length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message:
          'JWT_SECRET must contain at least 32 non-whitespace characters in production.',
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * NestJS ConfigModule validation function.
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
