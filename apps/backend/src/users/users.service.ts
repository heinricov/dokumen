import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@workspace/db';
import type {
  CreateUserInput,
  Role,
  UpdateUserInput,
  User,
  UserListQuery,
  UserListResponse,
} from '@workspace/types';
import { ROLE_NAMES, canAssignRole, roleRank } from '@workspace/types';
import bcrypt from 'bcryptjs';

import { sanitizeLimit, sanitizePage } from '../common/utils/pagination';
import { secondPrecision } from '../common/utils/time';
import { PrismaService } from '../db/prisma.service';

const SALT_ROUNDS = 10;

/**
 * Serializable transaction digunakan untuk mencegah race condition,
 * terutama ketika dua request secara bersamaan mencoba menghapus
 * atau menurunkan role ADMIN terakhir.
 */
const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

export interface UserActor {
  id: string;
  roleName: string;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create user
   */
  async create(data: CreateUserInput, actor: UserActor): Promise<User> {
    const role = await this.assertRoleExists(data.roleId);

    /**
     * Pastikan actor mempunyai hak untuk membuat user
     * dengan role yang diminta.
     */
    if (!canAssignRole(actor.roleName, role.name)) {
      throw new ForbiddenException('You cannot create a user with that role.');
    }

    /**
     * Validasi team jika diberikan.
     */
    if (data.teamId) {
      await this.assertTeamExists(data.teamId);
    }

    const email = this.normalizeEmail(data.email);

    const username = this.normalizeUsername(data.username);

    const password = await bcrypt.hash(data.password, SALT_ROUNDS);

    try {
      return await this.prisma.db.users.create({
        data: {
          email,
          username,
          password,
          passwordChangedAt: secondPrecision(),
          roleId: data.roleId,
          teamId: data.teamId,
        },
        omit: {
          password: true,
        },
      });
    } catch (error) {
      /**
       * Unique constraint.
       *
       * Saat ini email merupakan field unique.
       */
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already in use');
      }

      throw error;
    }
  }

  /**
   * Find all users
   */
  async findAll(query: UserListQuery = {}): Promise<UserListResponse> {
    const page = sanitizePage(query.page);
    const limit = sanitizeLimit(query.limit);

    const { search, roleId, teamId } = query;

    const where = {
      ...(search
        ? {
            OR: [
              {
                email: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                username: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),

      ...(roleId
        ? {
            roleId,
          }
        : {}),

      ...(teamId
        ? {
            teamId,
          }
        : {}),
    };

    const [data, total] = await this.prisma.db.$transaction([
      this.prisma.db.users.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        omit: {
          password: true,
        },
      }),

      this.prisma.db.users.count({
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
   * Find one user
   */
  async findOne(id: string): Promise<User> {
    return this.getUser(id);
  }

  /**
   * Update user
   */
  async update(
    id: string,
    data: UpdateUserInput,
    actor: UserActor,
  ): Promise<User> {
    return this.prisma.db.$transaction(async (tx) => {
      /**
       * Ambil target user beserta role.
       */
      const target = await tx.users.findUnique({
        where: {
          id,
        },
        include: {
          role: true,
        },
      });

      if (!target) {
        throw new NotFoundException(`User ${id} not found`);
      }

      /**
       * Validasi apakah actor boleh mengelola
       * target user.
       *
       * Policy:
       * - User tidak boleh mengelola dirinya sendiri
       *   melalui endpoint management.
       * - ADMIN dapat mengelola user lain.
       * - MODERATOR hanya dapat mengelola role
       *   yang lebih rendah.
       */
      this.assertCanManage(actor, target.id, target.role.name);

      /**
       * ================================
       * ROLE VALIDATION
       * ================================
       */
      if (data.roleId !== undefined && data.roleId !== target.roleId) {
        const nextRole = await tx.roles.findUnique({
          where: {
            id: data.roleId,
          },
        });

        if (!nextRole) {
          throw new NotFoundException(`Role ${data.roleId} not found`);
        }

        /**
         * Pastikan actor boleh memberikan
         * role tersebut.
         */
        if (!canAssignRole(actor.roleName, nextRole.name)) {
          throw new ForbiddenException('You cannot assign that role.');
        }

        /**
         * Jangan sampai ADMIN terakhir
         * diturunkan menjadi role lain.
         */
        if (
          target.role.name === ROLE_NAMES.ADMIN &&
          nextRole.name !== ROLE_NAMES.ADMIN
        ) {
          await this.assertAdminNotLast(tx);
        }
      }

      /**
       * ================================
       * TEAM VALIDATION
       * ================================
       *
       * undefined:
       *   tidak mengubah team.
       *
       * UUID:
       *   menghubungkan user ke team.
       *
       * null:
       *   melepaskan user dari team.
       */
      if (data.teamId !== undefined) {
        if (data.teamId !== null) {
          await this.assertTeamExists(data.teamId, tx);
        }
      }

      /**
       * ================================
       * BUILD UPDATE DATA
       * ================================
       *
       * Jangan menggunakan:
       *
       *   data: { ...data }
       *
       * karena itu dapat menyebabkan
       * mass-assignment.
       *
       * Selain itu Prisma UsersUpdateInput
       * menggunakan relation field `role`
       * dan `team`, bukan `roleId` dan `teamId`.
       */
      const updateData: Prisma.UsersUpdateInput = {};

      /**
       * Email
       */
      if (data.email !== undefined) {
        updateData.email = this.normalizeEmail(data.email);
      }

      /**
       * Username
       */
      if (data.username !== undefined) {
        updateData.username = this.normalizeUsername(data.username);
      }

      /**
       * Role
       *
       * Prisma UsersUpdateInput menggunakan
       * relation:
       *
       * role: {
       *   connect: {
       *     id: roleId
       *   }
       * }
       */
      if (data.roleId !== undefined) {
        updateData.role = {
          connect: {
            id: data.roleId,
          },
        };
      }

      /**
       * Team
       *
       * Jika UUID → connect
       * Jika null → disconnect
       */
      if (data.teamId !== undefined) {
        if (data.teamId === null) {
          updateData.team = {
            disconnect: true,
          };
        } else {
          updateData.team = {
            connect: {
              id: data.teamId,
            },
          };
        }
      }

      /**
       * Password
       *
       * Hanya hash apabila password
       * benar-benar dikirim.
       */
      if (data.password !== undefined) {
        const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

        updateData.password = hashedPassword;

        /**
         * Digunakan oleh JWT strategy
         * untuk membuat token lama tidak
         * lagi valid setelah password berubah.
         */
        updateData.passwordChangedAt = secondPrecision();
      }

      /**
       * Jalankan update.
       */
      try {
        return await tx.users.update({
          where: {
            id,
          },
          data: updateData,
          omit: {
            password: true,
          },
        });
      } catch (error) {
        /**
         * Unique constraint, misalnya email
         * sudah digunakan user lain.
         */
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('Email already in use');
        }

        throw error;
      }
    }, TRANSACTION_OPTIONS);
  }

  /**
   * Delete user
   */
  async remove(id: string, actor: UserActor): Promise<User> {
    return this.prisma.db.$transaction(async (tx) => {
      /**
       * Cari target user.
       */
      const target = await tx.users.findUnique({
        where: {
          id,
        },
        include: {
          role: true,
        },
      });

      if (!target) {
        throw new NotFoundException(`User ${id} not found`);
      }

      /**
       * Tidak boleh menghapus diri sendiri
       * melalui management endpoint.
       */
      this.assertCanManage(actor, target.id, target.role.name);

      /**
       * Jangan menghapus ADMIN terakhir.
       */
      if (target.role.name === ROLE_NAMES.ADMIN) {
        await this.assertAdminNotLast(tx);
      }

      try {
        return await tx.users.delete({
          where: {
            id,
          },
          omit: {
            password: true,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          throw new NotFoundException(`User ${id} not found`);
        }

        throw error;
      }
    }, TRANSACTION_OPTIONS);
  }

  /**
   * Check apakah actor boleh mengelola target.
   *
   * Policy:
   *
   * ADMIN
   *   → boleh manage user lain dengan role apa pun.
   *
   * MODERATOR
   *   → hanya boleh manage role di bawahnya.
   *
   * USER
   *   → tidak boleh manage user.
   *
   * Self-management
   *   → selalu ditolak pada endpoint ini.
   */
  private assertCanManage(
    actor: UserActor,
    targetId: string,
    targetRoleName: string,
  ): void {
    const actorRoleName = actor.roleName.trim().toUpperCase();

    const targetRole = targetRoleName.trim().toUpperCase();

    /**
     * Prevent self-management.
     */
    if (actor.id === targetId) {
      throw new ForbiddenException(
        'You cannot manage your own account through this endpoint.',
      );
    }

    /**
     * ADMIN dapat mengelola user lain
     * dengan role apa pun.
     */
    if (actorRoleName === ROLE_NAMES.ADMIN) {
      return;
    }

    /**
     * Role actor harus lebih tinggi
     * daripada role target.
     */
    if (roleRank(actorRoleName) <= roleRank(targetRole)) {
      throw new ForbiddenException(
        'You do not have permission to manage a user with equal or higher role.',
      );
    }
  }

  /**
   * Prevent deleting/demoting the last ADMIN.
   *
   * Fungsi ini harus dijalankan di dalam
   * SERIALIZABLE transaction.
   */
  private async assertAdminNotLast(
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const adminCount = await tx.users.count({
      where: {
        role: {
          name: ROLE_NAMES.ADMIN,
        },
      },
    });

    if (adminCount <= 1) {
      throw new ForbiddenException(
        'Cannot remove or demote the last ADMIN account.',
      );
    }
  }

  /**
   * Get user tanpa password.
   */
  private async getUser(id: string): Promise<User> {
    try {
      return await this.prisma.db.users.findUniqueOrThrow({
        where: {
          id,
        },
        omit: {
          password: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`User ${id} not found`);
      }

      throw error;
    }
  }

  /**
   * Check apakah role tersedia.
   */
  private async assertRoleExists(roleId: string): Promise<Role> {
    const role = await this.prisma.db.roles.findUnique({
      where: {
        id: roleId,
      },
    });

    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }

    return role;
  }

  /**
   * Check apakah team tersedia.
   *
   * tx optional:
   *
   * create()
   *   → menggunakan PrismaService biasa.
   *
   * update()
   *   → menggunakan transaction client.
   */
  private async assertTeamExists(
    teamId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma.db;

    const team = await client.teams.findUnique({
      where: {
        id: teamId,
      },
    });

    if (!team) {
      throw new NotFoundException(`Team ${teamId} not found`);
    }
  }

  /**
   * Normalize email.
   */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Normalize username.
   *
   * undefined/null:
   *   → null
   *
   * whitespace:
   *   → null
   *
   * normal value:
   *   → trimmed value
   */
  private normalizeUsername(username?: string | null): string | null {
    if (username === undefined || username === null) {
      return null;
    }

    const normalized = username.trim();

    return normalized.length > 0 ? normalized : null;
  }
}
