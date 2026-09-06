import { Module } from '@nestjs/common';
import { PrismaModule } from './db/prisma.module';
import { UsersModule } from './users/users.module';
import { TeamsModule } from './teams/teams.module';
import { RolesModule } from './roles/roles.module';

@Module({
  imports: [PrismaModule, UsersModule, TeamsModule, RolesModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
