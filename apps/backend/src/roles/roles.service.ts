import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type {
  CreateRoleInput,
  Role,
  RoleListQuery,
  RoleListResponse,
  UpdateRoleInput,
} from '@workspace/types';
import { isSystemRoleName } from '@workspace/types';
import { sanitizeLimit, sanitizePage } from '../common/utils/pagination';
import { PrismaService } from '../db/prisma.service';

@Injectable()
export class RolesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(data: CreateRoleInput): Promise<Role> {
    if (isSystemRoleName(data.name)) {
      throw new ConflictException(
        `Role name "${data.name}" is a reserved system role.`,
      );
    }
    return this.prisma.db.roles.create({ data });
  }

  async findAll(query: RoleListQuery = {}): Promise<RoleListResponse> {
    const page = sanitizePage(query.page);
    const limit = sanitizeLimit(query.limit);
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
    const role = await this.prisma.db.roles.findUniqueOrThrow({
      where: { id },
    });
    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be modified.');
    }
    return this.prisma.db.roles.update({ where: { id }, data });
  }

  async remove(id: string): Promise<Role> {
    const role = await this.prisma.db.roles.findUniqueOrThrow({
      where: { id },
    });
    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be deleted.');
    }
    return this.prisma.db.roles.delete({ where: { id } });
  }
}
