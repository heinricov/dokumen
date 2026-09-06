import { Module } from '@nestjs/common';
import { PrismaModule } from './db/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
