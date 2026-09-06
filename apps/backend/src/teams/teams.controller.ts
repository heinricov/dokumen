import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { UuidParamDto } from '../common/dto/common.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { validateDto } from '../common/pipes/dto-validation.pipe';

import { CreateTeamDto } from './dto/create-team.dto';
import { TeamListQueryDto } from './dto/team-list-query.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(
    @Inject(TeamsService)
    private readonly teamsService: TeamsService,
  ) {}

  /**
   * Create team
   *
   * ADMIN / MODERATOR only.
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MODERATOR')
  create(
    @Body(validateDto(CreateTeamDto))
    createTeamDto: CreateTeamDto,
  ) {
    return this.teamsService.create(createTeamDto);
  }

  /**
   * List teams
   *
   * Any authenticated user.
   */
  @Get()
  findAll(
    @Query(validateDto(TeamListQueryDto))
    query: TeamListQueryDto,
  ) {
    return this.teamsService.findAll(query);
  }

  /**
   * Get team
   *
   * Any authenticated user.
   */
  @Get(':id')
  findOne(
    @Param(validateDto(UuidParamDto))
    params: UuidParamDto,
  ) {
    return this.teamsService.findOne(params.id);
  }

  /**
   * Update team
   *
   * ADMIN / MODERATOR only.
   */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MODERATOR')
  update(
    @Param(validateDto(UuidParamDto))
    params: UuidParamDto,

    @Body(validateDto(UpdateTeamDto))
    updateTeamDto: UpdateTeamDto,
  ) {
    return this.teamsService.update(params.id, updateTeamDto);
  }

  /**
   * Delete team
   *
   * ADMIN / MODERATOR only.
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MODERATOR')
  remove(
    @Param(validateDto(UuidParamDto))
    params: UuidParamDto,
  ) {
    return this.teamsService.remove(params.id);
  }
}
