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
import { IdParamDto } from '../common/dto/common.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { validateDto } from '../common/pipes/dto-validation.pipe';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { TeamListQueryDto } from './dto/team-list-query.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(
    @Inject(TeamsService) private readonly teamsService: TeamsService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MODERATOR')
  create(@Body(validateDto(CreateTeamDto)) createTeamDto: CreateTeamDto) {
    return this.teamsService.create(createTeamDto);
  }

  @Get()
  findAll(@Query(validateDto(TeamListQueryDto)) query: TeamListQueryDto) {
    return this.teamsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param(validateDto(IdParamDto)) params: IdParamDto) {
    return this.teamsService.findOne(params.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MODERATOR')
  update(
    @Param(validateDto(IdParamDto)) params: IdParamDto,
    @Body(validateDto(UpdateTeamDto)) updateTeamDto: UpdateTeamDto,
  ) {
    return this.teamsService.update(params.id, updateTeamDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MODERATOR')
  remove(@Param(validateDto(IdParamDto)) params: IdParamDto) {
    return this.teamsService.remove(params.id);
  }
}
