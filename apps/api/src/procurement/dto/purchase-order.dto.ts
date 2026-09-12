import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class PurchaseOrderItemDto {
  @IsString() materialId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsString() unit!: string;
  @IsNumber() @Min(0) unitPrice!: number;
}

export class CreatePurchaseOrderDto {
  @IsString() factoryId!: string;
  @IsString() supplierId!: string;
  @IsOptional() @IsString() purchaseRequestId?: string;
  @IsOptional() @IsDateString() expectedDate?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];
}

export const PURCHASE_ORDER_STATUSES = [
  'DRAFT',
  'APPROVED',
  'SENT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;

export class UpdatePurchaseOrderStatusDto {
  @IsIn(PURCHASE_ORDER_STATUSES)
  status!: (typeof PURCHASE_ORDER_STATUSES)[number];
}
