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

export class UpdateProductionOrderStatusDto {
  @IsIn(PRODUCTION_ORDER_STATUSES)
  status!: (typeof PRODUCTION_ORDER_STATUSES)[number];
}
