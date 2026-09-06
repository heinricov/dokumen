import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@workspace/db';
import type {
  CreateUserInput,
  UpdateUserInput,
  User,
  UserListQuery,
  UserListResponse,
} from '@workspace/types';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../db/prisma.service';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(data: CreateUserInput): Promise<User> {
    await this.assertRoleExists(data.roleId);
    if (data.teamId) {
      await this.assertTeamExists(data.teamId);
    }

    try {
      return await this.prisma.db.users.create({
        data: {
          email: data.email,
          username: data.username,
          password: await bcrypt.hash(data.password, SALT_ROUNDS),
          roleId: data.roleId,
          teamId: data.teamId,
        },
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
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
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

  async update(id: string, data: UpdateUserInput): Promise<User> {
    if (data.roleId) {
      await this.assertRoleExists(data.roleId);
    }
    if (data.teamId) {
      await this.assertTeamExists(data.teamId);
    }

    try {
      return await this.prisma.db.users.update({
        where: { id },
        data: {
          email: data.email,
          username: data.username,
          password: data.password
            ? await bcrypt.hash(data.password, SALT_ROUNDS)
            : undefined,
          roleId: data.roleId,
          teamId: data.teamId,
        },
        omit: { password: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`User ${id} not found`);
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<User> {
    try {
      return await this.prisma.db.users.delete({
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

  private async assertRoleExists(roleId: string): Promise<void> {
    const role = await this.prisma.db.roles.findUnique({
      where: { id: roleId },
    });
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }
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
