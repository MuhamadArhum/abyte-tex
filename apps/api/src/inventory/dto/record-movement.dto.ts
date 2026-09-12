import { IsBoolean, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

/** Manual variants of SRS §8.1's stock operations; RECEIVE/CONSUMPTION/PRODUCTION_RECEIPT normally come from Procurement/Production instead. */
export enum ManualMovementType {
  RECEIVE = 'RECEIVE',
  ISSUE = 'ISSUE',
  ADJUSTMENT = 'ADJUSTMENT',
  RETURN = 'RETURN',
}

export class RecordMovementDto {
  @IsString()
  warehouseId!: string;

  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() materialId?: string;
  @IsOptional() @IsString() batchNumber?: string;

  @IsEnum(ManualMovementType)
  type!: ManualMovementType;

  /** Always entered as a positive magnitude; direction is derived from `type` (ISSUE always decreases stock). */
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsString()
  unit!: string;

  /** ADJUSTMENT only: whether this decreases stock (e.g. correcting a shrinkage/damage count). Ignored for other types. */
  @IsOptional() @IsBoolean() decrease?: boolean;

  @IsOptional() @IsString() notes?: string;
}

export class TransferStockDto {
  @IsString() fromWarehouseId!: string;
  @IsOptional() @IsString() fromLocationId?: string;
  @IsString() toWarehouseId!: string;
  @IsOptional() @IsString() toLocationId?: string;

  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() materialId?: string;
  @IsOptional() @IsString() batchNumber?: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsString()
  unit!: string;

  @IsOptional() @IsString() notes?: string;
}
