import { IsIn, IsOptional, IsString } from 'class-validator';

export const SALES_ORDER_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'PRODUCTION_PLANNED',
  'IN_PRODUCTION',
  'QUALITY',
  'READY',
  'DISPATCHED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

/**
 * P1 remediation (WF-001/WF-002): the status flow per SRS §6.1 (Draft → Confirmed →
 * Production Planned → In Production → Quality → Ready → Dispatched → Completed) is
 * now enforced, not just documented — see `SALES_ORDER_MANUAL_TRANSITIONS` in
 * `sales.service.ts`. READY and DISPATCHED are deliberately absent as manual targets
 * from any state: they are system-set only, by `DispatchService.create()`, so a Sales
 * Order can never claim to be dispatched without a real `Dispatch` record backing it
 * (closes WF-002's exact concern). CANCELLED and COMPLETED are terminal — no
 * transition is legal out of either.
 */
export class UpdateSalesOrderStatusDto {
  @IsIn(SALES_ORDER_STATUSES)
  status!: SalesOrderStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
