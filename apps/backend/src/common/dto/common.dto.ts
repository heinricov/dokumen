import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MAX_PAGE_SIZE } from '@workspace/types';

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

export class SearchQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class IdParamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;
}
