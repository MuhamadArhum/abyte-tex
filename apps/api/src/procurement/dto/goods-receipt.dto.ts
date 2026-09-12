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

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemDto)
  items!: GoodsReceiptItemDto[];
}
