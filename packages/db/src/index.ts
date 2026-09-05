import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString =
  process.env.DATABASE_URL ??
  process.env.PRISMA_DATABASE_URL ??
  process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "Missing database connection string. Set DATABASE_URL, PRISMA_DATABASE_URL, or POSTGRES_URL.",
  );
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "../generated/prisma/client";