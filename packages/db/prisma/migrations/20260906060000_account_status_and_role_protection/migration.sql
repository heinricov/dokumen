-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- DropIndex
DROP INDEX "PasswordReset_tokenHash_idx";

-- DropIndex
DROP INDEX "RefreshToken_tokenHash_idx";

-- AlterTable
ALTER TABLE "Roles" ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Users" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- BootstrapAccountData
-- Mark the seeded base roles as system roles so they cannot be renamed or deleted.
UPDATE "Roles" SET "isSystem" = true WHERE "name" IN ('ADMIN', 'MODERATOR', 'USER');