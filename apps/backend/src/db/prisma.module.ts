import { Global, Module } from '@nestjs/common';
import { prisma } from '@workspace/db';
import { PRISMA } from './prisma.constants';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: PRISMA,
      useValue: prisma,
    },
  ],
  exports: [PrismaService, PRISMA],
})
export class PrismaModule {}
