import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateRoleInput,
  Role,
  RoleListQuery,
  RoleListResponse,
  UpdateRoleInput,
} from '@workspace/types';
import { PrismaService } from '../db/prisma.service';

@Injectable()
export class RolesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(data: CreateRoleInput): Promise<Role> {
    return this.prisma.db.roles.create({ data });
  }

  async findAll(query: RoleListQuery = {}): Promise<RoleListResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const where = query.search
      ? { name: { contains: query.search, mode: 'insensitive' as const } }
      : {};

    const [data, total] = await this.prisma.db.$transaction([
      this.prisma.db.roles.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.roles.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Role> {
    return this.prisma.db.roles.findUniqueOrThrow({ where: { id } });
  }

  async update(id: string, data: UpdateRoleInput): Promise<Role> {
    return this.prisma.db.roles.update({ where: { id }, data });
  }

  async remove(id: string): Promise<Role> {
    return this.prisma.db.roles.delete({ where: { id } });
  }
}
