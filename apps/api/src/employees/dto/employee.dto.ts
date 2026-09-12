import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export enum EmploymentStatusDto {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  TERMINATED = 'TERMINATED',
  ON_LEAVE = 'ON_LEAVE',
}

/** Fields per SRS §10.1. */
export class CreateEmployeeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,40}$/, { message: 'employeeCode must be 2-40 letters, numbers, hyphens, or underscores' })
  employeeCode!: string;

  @IsString() @MinLength(1) firstName!: string;
  @IsString() @MinLength(1) lastName!: string;

  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsDateString() joiningDate?: string;
  @IsOptional() @IsString() shiftId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsDateString() joiningDate?: string;
  @IsOptional() @IsString() shiftId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsEnum(EmploymentStatusDto) employmentStatus?: EmploymentStatusDto;
}
