import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  url:
    process.env.DATABASE_URL ??
    process.env.PRISMA_DATABASE_URL ??
    process.env.POSTGRES_URL,
}));
