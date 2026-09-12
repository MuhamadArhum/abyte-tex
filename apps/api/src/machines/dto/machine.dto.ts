import { IsDateString, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export enum MachineStatusDto {
  RUNNING = 'RUNNING',
  IDLE = 'IDLE',
  BREAKDOWN = 'BREAKDOWN',
  MAINTENANCE = 'MAINTENANCE',
  OFFLINE = 'OFFLINE',
}

/** Fields per SRS §7.5. */
export class CreateMachineDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,40}$/, { message: 'machineCode must be 2-40 letters, numbers, hyphens, or underscores' })
  machineCode!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  type!: string;

  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() capacity?: string;
  @IsOptional() @IsDateString() installationDate?: string;
}

export class UpdateMachineDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() capacity?: string;
  @IsOptional() @IsDateString() installationDate?: string;
  @IsOptional() @IsEnum(MachineStatusDto) status?: MachineStatusDto;
}
