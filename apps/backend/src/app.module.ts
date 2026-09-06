import { Module } from '@nestjs/common';
import { PrismaModule } from './db/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TeamsModule } from './teams/teams.module';
import { RolesModule } from './roles/roles.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, TeamsModule, RolesModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
