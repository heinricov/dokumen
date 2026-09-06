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
import type { AuthUser } from '@workspace/types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/dto/common.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { validateDto } from '../common/pipes/dto-validation.pipe';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListQueryDto } from './dto/user-list-query.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

  @Post()
  @Roles('ADMIN', 'MODERATOR')
  create(
    @Body(validateDto(CreateUserDto)) createUserDto: CreateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.create(createUserDto, user.role.name);
  }

  @Get()
  @Roles('ADMIN', 'MODERATOR')
  findAll(@Query(validateDto(UserListQueryDto)) query: UserListQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'MODERATOR')
  findOne(@Param(validateDto(IdParamDto)) params: IdParamDto) {
    return this.usersService.findOne(params.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MODERATOR')
  update(
    @Param(validateDto(IdParamDto)) params: IdParamDto,
    @Body(validateDto(UpdateUserDto)) updateUserDto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.update(params.id, updateUserDto, user.role.name);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MODERATOR')
  remove(
    @Param(validateDto(IdParamDto)) params: IdParamDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.remove(params.id, user.role.name);
  }
}
