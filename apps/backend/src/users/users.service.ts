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

// Serializable isolation prevents two concurrent "demote/delete the last
// ADMIN" requests from both passing the admin-count check and leaving the
// system without any ADMIN. Under serializability one writer aborts with
// P2034 and is surfaced as a retryable conflict.
const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(data: CreateUserInput, actorRoleName: string): Promise<User> {
    const role = await this.assertRoleExists(data.roleId);
    if (!canAssignRole(actorRoleName, role.name)) {
      throw new ForbiddenException('You cannot create a user with that role.');
    }
    if (data.teamId) {
      await this.assertTeamExists(data.teamId);
    }

    try {
      return await this.prisma.db.users.create({
        data: {
          email: data.email.toLowerCase(),
          username: data.username,
          password: await bcrypt.hash(data.password, SALT_ROUNDS),
          passwordChangedAt: secondPrecision(),
          roleId: data.roleId,
          teamId: data.teamId,
        },
        omit: { password: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }
  }

  async findAll(query: UserListQuery = {}): Promise<UserListResponse> {
    const page = sanitizePage(query.page);
    const limit = sanitizeLimit(query.limit);
    const { search, roleId, teamId } = query;
    const where = {
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { username: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(roleId ? { roleId } : {}),
      ...(teamId ? { teamId } : {}),
    };

    const [data, total] = await this.prisma.db.$transaction([
      this.prisma.db.users.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        omit: { password: true },
      }),
      this.prisma.db.users.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<User> {
    return this.getUser(id);
  }

  async update(
    id: string,
    data: UpdateUserInput,
    actorRoleName: string,
  ): Promise<User> {
    return this.prisma.db.$transaction(async (tx) => {
      const target = await tx.users.findUnique({
        where: { id },
        include: { role: true },
      });
      if (!target) {
        throw new NotFoundException(`User ${id} not found`);
      }

      this.assertCanManage(actorRoleName, target.role.name);

      if (data.roleId && data.roleId !== target.roleId) {
        const nextRole = await tx.roles.findUnique({
          where: { id: data.roleId },
        });
        if (!nextRole) {
          throw new NotFoundException(`Role ${data.roleId} not found`);
        }
        if (!canAssignRole(actorRoleName, nextRole.name)) {
          throw new ForbiddenException('You cannot assign that role.');
        }
        if (
          target.role.name === ROLE_NAMES.ADMIN &&
          nextRole.name !== ROLE_NAMES.ADMIN
        ) {
          await this.assertAdminNotLast(tx);
        }
      }

      if (data.teamId) {
        await this.assertTeamExists(data.teamId);
      }

      return tx.users.update({
        where: { id },
        data: {
          email: data.email ? data.email.toLowerCase() : undefined,
          username: data.username,
          password: data.password
            ? await bcrypt.hash(data.password, SALT_ROUNDS)
            : undefined,
          passwordChangedAt: data.password ? secondPrecision() : undefined,
          roleId: data.roleId,
          teamId: data.teamId,
        },
        omit: { password: true },
      });
    }, TRANSACTION_OPTIONS);
  }

  async remove(id: string, actorRoleName: string): Promise<User> {
    return this.prisma.db.$transaction(async (tx) => {
      const target = await tx.users.findUnique({
        where: { id },
        include: { role: true },
      });
      if (!target) {
        throw new NotFoundException(`User ${id} not found`);
      }

      this.assertCanManage(actorRoleName, target.role.name);

      if (target.role.name === ROLE_NAMES.ADMIN) {
        await this.assertAdminNotLast(tx);
      }

      return tx.users.delete({ where: { id }, omit: { password: true } });
    }, TRANSACTION_OPTIONS);
  }

  private assertCanManage(actorRoleName: string, targetRoleName: string): void {
    if (actorRoleName === ROLE_NAMES.ADMIN) {
      return;
    }
    if (roleRank(actorRoleName) <= roleRank(targetRoleName)) {
      throw new ForbiddenException(
        'You do not have permission to manage a user with equal or higher role.',
      );
    }
  }

  private async assertAdminNotLast(
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const adminCount = await tx.users.count({
      where: { role: { name: ROLE_NAMES.ADMIN } },
    });
    if (adminCount <= 1) {
      throw new ForbiddenException(
        'Cannot remove or demote the last ADMIN account.',
      );
    }
  }

  private async getUser(id: string): Promise<User> {
    try {
      return await this.prisma.db.users.findUniqueOrThrow({
        where: { id },
        omit: { password: true },
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

  private async assertRoleExists(roleId: string): Promise<Role> {
    const role = await this.prisma.db.roles.findUnique({
      where: { id: roleId },
    });
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }
    return role;
  }

  private async assertTeamExists(teamId: string): Promise<void> {
    const team = await this.prisma.db.teams.findUnique({
      where: { id: teamId },
    });
    if (!team) {
      throw new NotFoundException(`Team ${teamId} not found`);
    }
  }
}
