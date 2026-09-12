import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() timezone?: string;

  @IsOptional() @IsInt() @Min(1) @Max(12) fiscalYearStartMonth?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workingDays?: number[];

  @IsOptional() @IsString() workingHoursStart?: string;
  @IsOptional() @IsString() workingHoursEnd?: string;

  @IsOptional() @IsString() defaultFactoryId?: string;
  @IsOptional() @IsString() defaultWarehouseId?: string;

  @IsOptional() @IsObject() numberFormatSettings?: Record<string, unknown>;
  @IsOptional() @IsObject() invoiceFormatSettings?: Record<string, unknown>;
  @IsOptional() @IsObject() productionSettings?: Record<string, unknown>;
}

export class UpdateTenantStatusDto {
  @IsIn(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'])
  status!: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
}
