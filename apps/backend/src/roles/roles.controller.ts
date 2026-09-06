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
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleListQueryDto } from './dto/role-list-query.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(
    @Inject(RolesService) private readonly rolesService: RolesService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  create(@Body(validateDto(CreateRoleDto)) createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Get()
  findAll(@Query(validateDto(RoleListQueryDto)) query: RoleListQueryDto) {
    return this.rolesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param(validateDto(IdParamDto)) params: IdParamDto) {
    return this.rolesService.findOne(params.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  update(
    @Param(validateDto(IdParamDto)) params: IdParamDto,
    @Body(validateDto(UpdateRoleDto)) updateRoleDto: UpdateRoleDto,
  ) {
    return this.rolesService.update(params.id, updateRoleDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  remove(@Param(validateDto(IdParamDto)) params: IdParamDto) {
    return this.rolesService.remove(params.id);
  }
}
