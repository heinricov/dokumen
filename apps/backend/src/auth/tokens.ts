import { createHash, randomBytes } from 'node:crypto';

const RESET_TOKEN_BYTES = 32;
const REFRESH_TOKEN_BYTES = 48;

export function generateOpaqueToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

export function generateRefreshToken(): string {
  return generateOpaqueToken(REFRESH_TOKEN_BYTES);
}

export function generateResetToken(): string {
  return generateOpaqueToken(RESET_TOKEN_BYTES);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
