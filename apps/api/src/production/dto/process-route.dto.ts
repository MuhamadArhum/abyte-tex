import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

export class ProcessRouteStageDto {
  @IsInt() @Min(1) sequence!: number;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsInt() @Min(1) expectedDurationMinutes?: number;
}

/** Configurable stage sequence per SRS §7.2. */
export class CreateProcessRouteDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProcessRouteStageDto)
  stages!: ProcessRouteStageDto[];
}
