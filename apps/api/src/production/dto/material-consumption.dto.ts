import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RecordMaterialConsumptionDto {
  @IsString() productionOrderId!: string;
  @IsOptional() @IsString() productionBatchId?: string;
  @IsString() materialId!: string;
  @IsString() warehouseId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsString() unit!: string;
}
