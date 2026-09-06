import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { resolve } from 'node:path';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { AuthModule } from './auth/auth.module';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { databaseConfig } from './config/database.config';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './db/prisma.module';
import { RolesModule } from './roles/roles.module';
import { TeamsModule } from './teams/teams.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(process.cwd(), '../../.env'),
      load: [appConfig, authConfig, databaseConfig],
      validate: validateEnv,
    }),
    PrismaModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
    }),
    AuthModule,
    UsersModule,
    TeamsModule,
    RolesModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: PrismaExceptionFilter,
    },
  ],
})
export class AppModule {}
