import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class GoodsReceiptItemDto {
  @IsString() purchaseOrderItemId!: string;
  @IsNumber() @Min(0) receivedQty!: number;
  @IsNumber() @Min(0) acceptedQty!: number;
  @IsOptional() @IsNumber() @Min(0) rejectedQty?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateGoodsReceiptDto {
  @IsString() purchaseOrderId!: string;
  @IsString() warehouseId!: string;
  /** P1 remediation (API-005): optional client-generated key — a retried request with the same key returns the original receipt instead of creating a second one. */
  @IsOptional() @IsString() idempotencyKey?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemDto)
  items!: GoodsReceiptItemDto[];
}
