import { IsDateString, IsIn, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Manual creation is for PREVENTIVE jobs (SRS §9.3) — CORRECTIVE jobs are created
 * automatically by DowntimeService when a machine breakdown is recorded.
 */
export class CreateMaintenanceJobDto {
  @IsString() factoryId!: string;
  @IsString() machineId!: string;
  @IsOptional() @IsString() scheduleId?: string;
  @IsOptional() @IsDateString() scheduledDate?: string;
  @IsOptional() @IsString() technicianId?: string;
  @IsOptional() @IsString() notes?: string;
}

export const MAINTENANCE_JOB_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type MaintenanceJobStatus = (typeof MAINTENANCE_JOB_STATUSES)[number];

/**
 * P1 remediation (WF-017): `status` is now validated against
 * `MAINTENANCE_JOB_TRANSITIONS` in `maintenance.service.ts` instead of being
 * accepted as any enum value from any current state.
 */
export class UpdateMaintenanceJobDto {
  @IsOptional() @IsIn(MAINTENANCE_JOB_STATUSES) status?: MaintenanceJobStatus;
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsDateString() completedAt?: string;
  @IsOptional() @IsString() technicianId?: string;
  @IsOptional() @IsObject() sparePartsUsed?: Record<string, unknown>;
  @IsOptional() @IsNumber() cost?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateMaintenanceScheduleDto {
  @IsString() machineId!: string;
  @IsNumber() frequencyDays!: number;
  @IsOptional() @IsString() notes?: string;
}
