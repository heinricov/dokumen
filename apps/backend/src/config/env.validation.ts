import { z } from 'zod';
import { parseDurationToMs } from './duration.util';

const durationSchema = z.string().refine(
  (value) => {
    try {
      parseDurationToMs(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Invalid duration format. Use e.g. "15m", "30d".' },
);

const numberSchema = z.coerce.number().int().positive().optional();

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  BACKEND_PORT: numberSchema,
  PORT: numberSchema,
  DATABASE_URL: z.string().min(1).optional(),
  PRISMA_DATABASE_URL: z.string().min(1).optional(),
  POSTGRES_URL: z.string().min(1).optional(),
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters long')
    .refine(
      (value) =>
        !['development-secret', 'jwt-secret', 'secret'].includes(value),
      {
        message:
          'JWT_SECRET must not use a known default/example secret value.',
      },
    ),
  JWT_EXPIRES_IN: durationSchema.default('15m'),
  JWT_REFRESH_EXPIRES_IN: durationSchema.default('30d'),
  JWT_RESET_EXPIRES_IN: durationSchema.default('15m'),
  CORS_ORIGINS: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

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
