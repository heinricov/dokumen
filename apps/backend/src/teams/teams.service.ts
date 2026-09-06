import { Injectable } from '@nestjs/common';
import type {
  CreateTeamInput,
  Team,
  TeamListQuery,
  TeamListResponse,
  UpdateTeamInput,
} from '@workspace/types';
import { PrismaService } from '../db/prisma.service';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateTeamInput): Promise<Team> {
    return this.prisma.db.teams.create({ data });
  }

  async findAll(query: TeamListQuery = {}): Promise<TeamListResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const where = query.search
      ? { name: { contains: query.search, mode: 'insensitive' as const } }
      : {};

    const [data, total] = await this.prisma.db.$transaction([
      this.prisma.db.teams.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.teams.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Team> {
    return this.prisma.db.teams.findUniqueOrThrow({ where: { id } });
  }

  async update(id: string, data: UpdateTeamInput): Promise<Team> {
    return this.prisma.db.teams.update({ where: { id }, data });
  }

  async remove(id: string): Promise<Team> {
    return this.prisma.db.teams.delete({ where: { id } });
  }
}
