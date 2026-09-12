import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class DispatchItemDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() salesOrderItemId?: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsString() unit!: string;
  @IsOptional() @IsString() batchNumber?: string;
}

/** Fields per SRS §8.4. */
export class CreateDispatchDto {
  @IsString() factoryId!: string;
  @IsString() salesOrderId!: string;
  @IsString() warehouseId!: string;
  @IsOptional() @IsString() vehicleNumber?: string;
  @IsOptional() @IsString() driverName?: string;
  @IsOptional() @IsString() driverPhone?: string;
  @IsOptional() @IsString() deliveryAddress?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DispatchItemDto)
  items!: DispatchItemDto[];
}
