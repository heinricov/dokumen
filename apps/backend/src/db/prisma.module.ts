import { Global, Module } from '@nestjs/common';
import { prisma } from '@workspace/db';
import { PRISMA } from './prisma.constants';

@Global()
@Module({
  providers: [
    {
      provide: PRISMA,
      useValue: prisma,
    },
  ],
  exports: [PRISMA],
})
export class PrismaModule {}
