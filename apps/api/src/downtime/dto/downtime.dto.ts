import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export enum DowntimeCategoryDto {
  MECHANICAL = 'MECHANICAL',
  ELECTRICAL = 'ELECTRICAL',
  MATERIAL_SHORTAGE = 'MATERIAL_SHORTAGE',
  OPERATOR_ISSUE = 'OPERATOR_ISSUE',
  MAINTENANCE = 'MAINTENANCE',
  POWER_FAILURE = 'POWER_FAILURE',
  PRODUCTION_CHANGEOVER = 'PRODUCTION_CHANGEOVER',
  OTHER = 'OTHER',
}

/** Fields per SRS §7.7. */
export class CreateDowntimeDto {
  @IsString() machineId!: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() operatorId?: string;
  @IsDateString() startTime!: string;
  @IsEnum(DowntimeCategoryDto) category!: DowntimeCategoryDto;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CloseDowntimeDto {
  @IsDateString() endTime!: string;
}
