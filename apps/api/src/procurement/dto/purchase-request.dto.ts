import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class PurchaseRequestItemDto {
  @IsString() materialId!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsString() unit!: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreatePurchaseRequestDto {
  @IsString()
  factoryId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestItemDto)
  items!: PurchaseRequestItemDto[];
}

export const PURCHASE_REQUEST_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONVERTED'] as const;

export class UpdatePurchaseRequestStatusDto {
  @IsIn(PURCHASE_REQUEST_STATUSES)
  status!: (typeof PURCHASE_REQUEST_STATUSES)[number];
}
