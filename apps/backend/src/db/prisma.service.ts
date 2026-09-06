import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { prisma } from '@workspace/db';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly client = prisma;

  get db() {
    return this.client;
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
