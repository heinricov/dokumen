import type { JwtSignOptions } from '@nestjs/jwt';

type ExpiresIn = JwtSignOptions['expiresIn'];

export type JwtEnv = {
  secret: string;
  accessExpiresIn: ExpiresIn;
  refreshExpiresInMs: number;
  resetExpiresInMs: number;
};

export const ACCESS_TOKEN_DEFAULT_TTL = '15m';
export const REFRESH_TOKEN_DEFAULT_TTL = '30d';
export const RESET_TOKEN_DEFAULT_TTL = '15m';

export function parseDurationToMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `Invalid duration format: "${value}". Use e.g. "15m", "30d".`,
    );
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * multipliers[unit];
}

export function readJwtEnv(): JwtEnv {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET is required. Set JWT_SECRET in the root .env file.',
    );
  }

  const accessExpiresIn = (process.env.JWT_EXPIRES_IN ??
    ACCESS_TOKEN_DEFAULT_TTL) as unknown as ExpiresIn;

  return {
    secret,
    accessExpiresIn,
    refreshExpiresInMs: parseDurationToMs(
      process.env.JWT_REFRESH_EXPIRES_IN ?? REFRESH_TOKEN_DEFAULT_TTL,
    ),
    resetExpiresInMs: parseDurationToMs(
      process.env.JWT_RESET_EXPIRES_IN ?? RESET_TOKEN_DEFAULT_TTL,
    ),
  };
}
