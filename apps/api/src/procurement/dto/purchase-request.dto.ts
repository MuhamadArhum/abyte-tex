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
export type PurchaseRequestStatus = (typeof PURCHASE_REQUEST_STATUSES)[number];

/**
 * P1 remediation (WF-004): CONVERTED is never a manually-settable target — it
 * is set only by `ProcurementService.createOrder()` when a real Purchase
 * Order is created against an APPROVED request. See
 * `PURCHASE_REQUEST_TRANSITIONS` in `procurement.service.ts`.
 */
export class UpdatePurchaseRequestStatusDto {
  @IsIn(PURCHASE_REQUEST_STATUSES)
  status!: PurchaseRequestStatus;
}
