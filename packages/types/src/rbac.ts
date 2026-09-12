/**
 * Mirrors apps/api/src/common/rbac.constants.ts by value. Kept as a hand-maintained
 * mirror rather than a cross-package import — see IMPLEMENTATION_DECISIONS.md D-017.
 * If you change the API's role/permission catalog, update this file in the same PR.
 */

export enum RoleCode {
  SUPER_ADMIN = 'SUPER_ADMIN',
  SUPPORT_ADMIN = 'SUPPORT_ADMIN',
  COMPANY_OWNER = 'COMPANY_OWNER',
  COMPANY_ADMIN = 'COMPANY_ADMIN',
  FACTORY_MANAGER = 'FACTORY_MANAGER',
  PRODUCTION_MANAGER = 'PRODUCTION_MANAGER',
  PRODUCTION_SUPERVISOR = 'PRODUCTION_SUPERVISOR',
  MACHINE_OPERATOR = 'MACHINE_OPERATOR',
  QUALITY_MANAGER = 'QUALITY_MANAGER',
  INVENTORY_MANAGER = 'INVENTORY_MANAGER',
  PURCHASE_MANAGER = 'PURCHASE_MANAGER',
  MAINTENANCE_MANAGER = 'MAINTENANCE_MANAGER',
  HR_MANAGER = 'HR_MANAGER',
  ACCOUNTANT = 'ACCOUNTANT',
  SALES_MANAGER = 'SALES_MANAGER',
  VIEWER = 'VIEWER',
}

export enum Action {
  VIEW = 'VIEW',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  EXPORT = 'EXPORT',
  PRINT = 'PRINT',
}

export enum Resource {
  TENANT = 'tenant',
  USER = 'user',
  ROLE = 'role',
  FACTORY = 'factory',
  DEPARTMENT = 'department',
  WAREHOUSE = 'warehouse',
  CUSTOMER = 'customer',
  SUPPLIER = 'supplier',
  PRODUCT = 'product',
  MATERIAL = 'material',
  SALES_ORDER = 'sales_order',
  PURCHASE_ORDER = 'purchase_order',
  PRODUCTION_ORDER = 'production_order',
  PRODUCTION_BATCH = 'production_batch',
  MACHINE = 'machine',
  DOWNTIME = 'downtime',
  STOCK = 'stock',
  DISPATCH = 'dispatch',
  QUALITY_INSPECTION = 'quality_inspection',
  MAINTENANCE_JOB = 'maintenance_job',
  EMPLOYEE = 'employee',
  ATTENDANCE = 'attendance',
  PAYROLL = 'payroll',
  COST_SHEET = 'cost_sheet',
  REPORT = 'report',
  AUDIT_LOG = 'audit_log',
}

export function hasPermission(allow: string[], deny: string[], resource: Resource, action: Action): boolean {
  const key = `${resource}:${action}`;
  if (deny.includes(key)) return false;
  return allow.includes(key);
}
