import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum AttendanceStatusDto {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  HALF_DAY = 'HALF_DAY',
  LEAVE = 'LEAVE',
}

/** Fields per SRS §10.2. */
export class MarkAttendanceDto {
  @IsString()
  employeeId!: string;

  @IsDateString()
  date!: string;

  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
  @IsEnum(AttendanceStatusDto) status!: AttendanceStatusDto;
  @IsOptional() @IsInt() @Min(0) overtimeMinutes?: number;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateAttendanceDto {
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
  @IsOptional() @IsEnum(AttendanceStatusDto) status?: AttendanceStatusDto;
  @IsOptional() @IsInt() @Min(0) overtimeMinutes?: number;
  @IsOptional() @IsString() notes?: string;
}
