import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** Fields per SRS §7.3. */
export class CreateProductionOrderDto {
  @IsString() factoryId!: string;
  @IsOptional() @IsString() salesOrderId?: string;
  @IsString() productId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsString() unit!: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() processRouteId?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  @IsOptional() @IsDateString() plannedStartDate?: string;
  @IsOptional() @IsDateString() plannedEndDate?: string;
  @IsOptional() @IsString() assignedMachineId?: string;
  @IsOptional() @IsString() assignedSupervisorId?: string;
}

export const PRODUCTION_ORDER_STATUSES = [
  'PLANNED',
  'RELEASED',
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type ProductionOrderStatus = (typeof PRODUCTION_ORDER_STATUSES)[number];

/**
 * P1 remediation (WF-007): transitions are now validated against
 * `PRODUCTION_ORDER_TRANSITIONS` in `production.service.ts` — a jump like
 * PLANNED -> COMPLETED is rejected, and COMPLETED additionally requires real
 * production evidence (batches with recorded output) — see `completeOrder()`.
 */
export class UpdateProductionOrderStatusDto {
  @IsIn(PRODUCTION_ORDER_STATUSES)
  status!: ProductionOrderStatus;
}
