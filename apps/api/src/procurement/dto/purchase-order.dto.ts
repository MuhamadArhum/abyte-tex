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
  /** P1 remediation (API-005): optional client-generated key — a retried request with the same key returns the original order instead of creating a second one. */
  @IsOptional() @IsString() idempotencyKey?: string;

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
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

/**
 * P1 remediation (WF-004): PARTIALLY_RECEIVED and RECEIVED are never
 * manually-settable — they are set only by
 * `ProcurementService.createGoodsReceipt()`, computed from real received
 * quantities. See `PURCHASE_ORDER_TRANSITIONS` in `procurement.service.ts`.
 */
export class UpdatePurchaseOrderStatusDto {
  @IsIn(PURCHASE_ORDER_STATUSES)
  status!: PurchaseOrderStatus;
}
