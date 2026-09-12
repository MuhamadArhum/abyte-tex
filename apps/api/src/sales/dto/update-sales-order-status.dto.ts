import { IsIn } from 'class-validator';

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
 * The status flow is ordered per SRS §6.1 (Draft → Confirmed → Production Planned →
 * In Production → Quality → Ready → Dispatched → Completed), but enforcing strict
 * forward-only transitions is deferred — see IMPLEMENTATION_DECISIONS.md D-022.
 * Any listed status is currently accepted; the audit log records every change.
 */
export class UpdateSalesOrderStatusDto {
  @IsIn(SALES_ORDER_STATUSES)
  status!: SalesOrderStatus;
}
