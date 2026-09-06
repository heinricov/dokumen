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
import { isSystemRoleName, normalizeRoleName } from '@workspace/types';
import { sanitizeLimit, sanitizePage } from '../common/utils/pagination';
import { PrismaService } from '../db/prisma.service';

@Injectable()
export class RolesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(data: CreateRoleInput): Promise<Role> {
    const name = normalizeRoleName(data.name);
    if (isSystemRoleName(name)) {
      throw new ConflictException(
        `Role name "${name}" is a reserved system role.`,
      );
    }
    return this.prisma.db.roles.create({ data: { name } });
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

    const name =
      data.name !== undefined ? normalizeRoleName(data.name) : undefined;
    if (name !== undefined && isSystemRoleName(name)) {
      throw new ConflictException(
        `Role name "${name}" is a reserved system role.`,
      );
    }

    return this.prisma.db.roles.update({
      where: { id },
      data: { ...(name !== undefined ? { name } : {}) },
    });
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
