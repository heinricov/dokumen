import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@workspace/db';
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
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create role
   */
  async create(data: CreateRoleInput): Promise<Role> {
    const name = normalizeRoleName(data.name);

    /**
     * Jangan izinkan nama kosong setelah
     * normalization.
     */
    if (!name) {
      throw new BadRequestException('Role name cannot be empty.');
    }

    /**
     * System roles tidak boleh dibuat ulang.
     */
    if (isSystemRoleName(name)) {
      throw new ConflictException(
        `Role name "${name}" is a reserved system role.`,
      );
    }

    try {
      return await this.prisma.db.roles.create({
        data: {
          name,
          isSystem: false,
        },
      });
    } catch (error) {
      /**
       * Role name unique.
       */
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Role name already exists.');
      }

      throw error;
    }
  }

  /**
   * Find all roles
   */
  async findAll(query: RoleListQuery = {}): Promise<RoleListResponse> {
    const page = sanitizePage(query.page);

    const limit = sanitizeLimit(query.limit);

    const search = query.search?.trim();

    const where = search
      ? {
          name: {
            contains: search,
            mode: 'insensitive' as const,
          },
        }
      : {};

    const [data, total] = await this.prisma.db.$transaction([
      this.prisma.db.roles.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),

      this.prisma.db.roles.count({
        where,
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Find one role
   */
  async findOne(id: string): Promise<Role> {
    try {
      return await this.prisma.db.roles.findUniqueOrThrow({
        where: {
          id,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Role ${id} not found`);
      }

      throw error;
    }
  }

  /**
   * Update role
   */
  async update(id: string, data: UpdateRoleInput): Promise<Role> {
    const role = await this.prisma.db.roles.findUnique({
      where: {
        id,
      },
    });

    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    /**
     * System roles tidak boleh dimodifikasi.
     */
    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be modified.');
    }

    /**
     * Tidak ada field yang perlu di-update.
     */
    if (data.name === undefined) {
      return role;
    }

    const name = normalizeRoleName(data.name);

    if (!name) {
      throw new BadRequestException('Role name cannot be empty.');
    }

    /**
     * Jangan izinkan custom role menggunakan
     * nama system role.
     */
    if (isSystemRoleName(name)) {
      throw new ConflictException(
        `Role name "${name}" is a reserved system role.`,
      );
    }

    /**
     * Tidak perlu melakukan update jika
     * namanya sama.
     */
    if (name === role.name) {
      return role;
    }

    try {
      return await this.prisma.db.roles.update({
        where: {
          id,
        },
        data: {
          name,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Role name already exists.');
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Role ${id} not found`);
      }

      throw error;
    }
  }

  /**
   * Delete role
   */
  async remove(id: string): Promise<Role> {
    const role = await this.prisma.db.roles.findUnique({
      where: {
        id,
      },
    });

    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    /**
     * System roles tidak boleh dihapus.
     */
    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be deleted.');
    }

    try {
      return await this.prisma.db.roles.delete({
        where: {
          id,
        },
      });
    } catch (error) {
      /**
       * Role masih digunakan oleh user.
       *
       * Schema menggunakan onDelete: Restrict.
       */
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Role cannot be deleted because it is still assigned to one or more users.',
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Role ${id} not found`);
      }

      throw error;
    }
  }
}
