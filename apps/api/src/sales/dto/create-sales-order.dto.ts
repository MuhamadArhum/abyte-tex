import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateSalesOrderItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsString()
  unit!: string;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;
}

/** Fields per SRS §6.1. orderNumber is generated server-side (see SalesService). */
export class CreateSalesOrderDto {
  @IsString()
  factoryId!: string;

  @IsString()
  customerId!: string;

  @IsOptional() @IsDateString() deliveryDate?: string;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsNumber() @Min(0) tax?: number;
  @IsOptional() @IsString() notes?: string;

  /** P1 remediation (API-005): optional client-generated key — a retried request with the same key returns the original order instead of creating a second one. */
  @IsOptional() @IsString() idempotencyKey?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesOrderItemDto)
  items!: CreateSalesOrderItemDto[];
}
