import { IsOptional, IsString, MaxLength } from 'class-validator';
import { SearchQueryDto } from '../../common/dto/common.dto';

export class UserListQueryDto extends SearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  roleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  teamId?: string;
}
