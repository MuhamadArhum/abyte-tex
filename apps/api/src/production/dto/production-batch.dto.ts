import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** Fields per SRS §7.4. */
export class CreateProductionBatchDto {
  @IsString() productionOrderId!: string;
  @IsOptional() @IsString() processStageId?: string;
  @IsOptional() @IsString() machineId?: string;
  @IsOptional() @IsString() operatorId?: string;
  @IsOptional() @IsString() shiftId?: string;

  @IsNumber() @Min(0) inputQuantity!: number;
  @IsOptional() @IsDateString() startTime?: string;
}

/** Recording output closes the batch and, if `outputWarehouseId` is given, receives the output into stock. */
export class RecordBatchOutputDto {
  @IsNumber() @Min(0) outputQuantity!: number;
  @IsOptional() @IsNumber() @Min(0) wastage?: number;
  @IsOptional() @IsNumber() @Min(0) rework?: number;
  @IsOptional() @IsNumber() @Min(0) rejection?: number;
  @IsOptional() @IsDateString() endTime?: string;
  @IsOptional() @IsString() outputWarehouseId?: string;
}

export class UpdateBatchStatusDto {
  @IsIn(['IN_PROGRESS', 'COMPLETED', 'HOLD'])
  status!: 'IN_PROGRESS' | 'COMPLETED' | 'HOLD';
}
