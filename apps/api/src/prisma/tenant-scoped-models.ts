import { Prisma } from '@prisma/client';

/**
 * Every Prisma model that carries a top-level `tenantId` scalar field (see
 * IMPLEMENTATION_DECISIONS.md D-014 for which models are deliberately excluded —
 * pure child line-items that inherit scope from a parent FK instead). Kept as an
 * explicit list rather than derived via reflection so adding a new tenant-scoped
 * model to schema.prisma without updating this list fails loudly in code review,
 * not silently in production.
 */
export const TENANT_SCOPED_MODELS: ReadonlySet<Prisma.ModelName> = new Set<Prisma.ModelName>([
  'User',
  'Role',
  'Factory',
  'Department',
  'Warehouse',
  'Shift',
  'Customer',
  'Supplier',
  'Product',
  'ProductCategory',
  'Material',
  'SalesQuotation',
  'SalesOrder',
  'PurchaseRequest',
  'PurchaseOrder',
  'GoodsReceipt',
  'ProcessRoute',
  'ProductionOrder',
  'ProductionBatch',
  'Machine',
  'MachineLog',
  'Downtime',
  'Stock',
  'StockMovement',
  'Dispatch',
  'InspectionTemplate',
  'QualityInspection',
  'MaintenanceJob',
  'MaintenanceSchedule',
  'Employee',
  'Attendance',
  'Incentive',
  'PayrollPeriod',
  'CostSheet',
  'Notification',
  'FileAsset',
  'AuditLog',
  'SyncEvent',
]);

/** Operation kinds where tenantId must be merged into `where`. */
export const WHERE_SCOPED_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** Operation kinds where tenantId must be merged into `data`. */
export const DATA_SCOPED_OPERATIONS = new Set(['create']);

/** `createMany` takes an array under `data` and needs different handling. */
export const CREATE_MANY_OPERATIONS = new Set(['createMany']);
