import type { JwtSignOptions } from '@nestjs/jwt';
import { registerAs } from '@nestjs/config';
import { parseDurationToMs } from './duration.util';

type ExpiresIn = JwtSignOptions['expiresIn'];

export const ACCESS_TOKEN_DEFAULT_TTL = '15m';
export const REFRESH_TOKEN_DEFAULT_TTL = '30d';
export const RESET_TOKEN_DEFAULT_TTL = '15m';

type AuthConfig = {
  jwtSecret: string | undefined;
  accessTokenTtl: ExpiresIn;
  accessTokenTtlMs: number;
  refreshTokenTtlMs: number;
  resetTokenTtlMs: number;
};

export const authConfig = registerAs('auth', (): AuthConfig => {
  const accessTokenTtl: ExpiresIn = (process.env.JWT_EXPIRES_IN ??
    ACCESS_TOKEN_DEFAULT_TTL) as ExpiresIn;
  const refreshTokenTtl =
    process.env.JWT_REFRESH_EXPIRES_IN ?? REFRESH_TOKEN_DEFAULT_TTL;
  const resetTokenTtl =
    process.env.JWT_RESET_EXPIRES_IN ?? RESET_TOKEN_DEFAULT_TTL;

  return {
    jwtSecret: process.env.JWT_SECRET,
    accessTokenTtl,
    accessTokenTtlMs: parseDurationToMs(accessTokenTtl as string),
    refreshTokenTtlMs: parseDurationToMs(refreshTokenTtl),
    resetTokenTtlMs: parseDurationToMs(resetTokenTtl),
  };
});
