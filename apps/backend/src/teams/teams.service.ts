import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@workspace/db';
import type {
  CreateTeamInput,
  Team,
  TeamListQuery,
  TeamListResponse,
  UpdateTeamInput,
} from '@workspace/types';

import { sanitizeLimit, sanitizePage } from '../common/utils/pagination';
import { PrismaService } from '../db/prisma.service';

@Injectable()
export class TeamsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create team
   */
  async create(data: CreateTeamInput): Promise<Team> {
    const name = this.normalizeName(data.name);

    if (!name) {
      throw new BadRequestException('Team name cannot be empty.');
    }

    try {
      return await this.prisma.db.teams.create({
        data: {
          name,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Team name already exists.');
      }

      throw error;
    }
  }

  /**
   * Find all teams
   */
  async findAll(query: TeamListQuery = {}): Promise<TeamListResponse> {
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
      this.prisma.db.teams.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),

      this.prisma.db.teams.count({
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
   * Find one team
   */
  async findOne(id: string): Promise<Team> {
    try {
      return await this.prisma.db.teams.findUniqueOrThrow({
        where: {
          id,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Team ${id} not found`);
      }

      throw error;
    }
  }

  /**
   * Update team
   */
  async update(id: string, data: UpdateTeamInput): Promise<Team> {
    const team = await this.prisma.db.teams.findUnique({
      where: {
        id,
      },
    });

    if (!team) {
      throw new NotFoundException(`Team ${id} not found`);
    }

    /**
     * Tidak ada field untuk di-update.
     */
    if (data.name === undefined) {
      return team;
    }

    const name = this.normalizeName(data.name);

    if (!name) {
      throw new BadRequestException('Team name cannot be empty.');
    }

    /**
     * Tidak perlu query UPDATE jika
     * nama tidak berubah.
     */
    if (name === team.name) {
      return team;
    }

    try {
      return await this.prisma.db.teams.update({
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
        throw new ConflictException('Team name already exists.');
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Team ${id} not found`);
      }

      throw error;
    }
  }

  /**
   * Delete team
   *
   * Schema menggunakan onDelete: SetNull,
   * sehingga user yang memiliki team ini
   * tidak ikut terhapus.
   */
  async remove(id: string): Promise<Team> {
    try {
      return await this.prisma.db.teams.delete({
        where: {
          id,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Team ${id} not found`);
      }

      throw error;
    }
  }

  /**
   * Normalize team name.
   */
  private normalizeName(name: string): string {
    return name.trim();
  }
}
