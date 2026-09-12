/**
 * Platform + tenant role catalog per SRS §4.1. Codes are stable identifiers seeded
 * into the `roles` table (see prisma/seed.ts) — never rename an existing code, add a
 * new one and migrate assignments if the catalog changes.
 */
export enum RoleCode {
  // Platform level
  SUPER_ADMIN = 'SUPER_ADMIN',
  SUPPORT_ADMIN = 'SUPPORT_ADMIN',
  // Tenant level
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

export const PLATFORM_ROLE_CODES: readonly RoleCode[] = [RoleCode.SUPER_ADMIN, RoleCode.SUPPORT_ADMIN];

export const TENANT_ROLE_CODES: readonly RoleCode[] = [
  RoleCode.COMPANY_OWNER,
  RoleCode.COMPANY_ADMIN,
  RoleCode.FACTORY_MANAGER,
  RoleCode.PRODUCTION_MANAGER,
  RoleCode.PRODUCTION_SUPERVISOR,
  RoleCode.MACHINE_OPERATOR,
  RoleCode.QUALITY_MANAGER,
  RoleCode.INVENTORY_MANAGER,
  RoleCode.PURCHASE_MANAGER,
  RoleCode.MAINTENANCE_MANAGER,
  RoleCode.HR_MANAGER,
  RoleCode.ACCOUNTANT,
  RoleCode.SALES_MANAGER,
  RoleCode.VIEWER,
];

/** The 8 assignable actions per SRS §4.2. */
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

/** Resource keys used in Permission.resource and the @RequirePermission decorator. */
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

/**
 * Default permission grants per role, seeded on tenant creation (prisma/seed.ts /
 * tenants.service.ts). Company Owner and Company Admin get full access to every
 * tenant resource; other roles get the subset relevant to their function. This is
 * the MVP default — SRS §4.2 permits further per-role/per-user tuning after seeding.
 */
const ALL_ACTIONS = Object.values(Action);
const VIEW_ONLY: Action[] = [Action.VIEW, Action.EXPORT, Action.PRINT];
const STANDARD: Action[] = [Action.VIEW, Action.CREATE, Action.UPDATE, Action.EXPORT, Action.PRINT];
const STANDARD_WITH_DELETE: Action[] = [...STANDARD, Action.DELETE];
const APPROVAL: Action[] = [...STANDARD, Action.APPROVE, Action.REJECT];

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleCode, Partial<Record<Resource, Action[]>>> = {
  [RoleCode.SUPER_ADMIN]: {}, // platform-wide bypass, not resource-scoped
  [RoleCode.SUPPORT_ADMIN]: {},

  [RoleCode.COMPANY_OWNER]: Object.fromEntries(Object.values(Resource).map((r) => [r, ALL_ACTIONS])) as Record<
    Resource,
    Action[]
  >,
  [RoleCode.COMPANY_ADMIN]: Object.fromEntries(
    Object.values(Resource)
      .filter((r) => r !== Resource.TENANT)
      .map((r) => [r, ALL_ACTIONS]),
  ) as Record<Resource, Action[]>,

  [RoleCode.FACTORY_MANAGER]: {
    [Resource.FACTORY]: STANDARD,
    [Resource.DEPARTMENT]: STANDARD_WITH_DELETE,
    [Resource.WAREHOUSE]: STANDARD_WITH_DELETE,
    [Resource.SALES_ORDER]: APPROVAL,
    [Resource.PURCHASE_ORDER]: APPROVAL,
    [Resource.PRODUCTION_ORDER]: APPROVAL,
    [Resource.PRODUCTION_BATCH]: STANDARD,
    [Resource.MACHINE]: STANDARD_WITH_DELETE,
    [Resource.DOWNTIME]: STANDARD,
    [Resource.STOCK]: STANDARD,
    [Resource.DISPATCH]: APPROVAL,
    [Resource.QUALITY_INSPECTION]: APPROVAL,
    [Resource.MAINTENANCE_JOB]: APPROVAL,
    [Resource.EMPLOYEE]: STANDARD_WITH_DELETE,
    [Resource.ATTENDANCE]: STANDARD,
    [Resource.PAYROLL]: APPROVAL,
    [Resource.COST_SHEET]: VIEW_ONLY,
    [Resource.REPORT]: VIEW_ONLY,
  },

  [RoleCode.PRODUCTION_MANAGER]: {
    [Resource.PRODUCTION_ORDER]: STANDARD_WITH_DELETE,
    [Resource.PRODUCTION_BATCH]: STANDARD_WITH_DELETE,
    [Resource.MACHINE]: STANDARD,
    [Resource.DOWNTIME]: STANDARD,
    [Resource.MATERIAL]: VIEW_ONLY,
    [Resource.STOCK]: VIEW_ONLY,
    [Resource.REPORT]: VIEW_ONLY,
  },
  [RoleCode.PRODUCTION_SUPERVISOR]: {
    [Resource.PRODUCTION_ORDER]: VIEW_ONLY,
    [Resource.PRODUCTION_BATCH]: STANDARD,
    [Resource.MACHINE]: VIEW_ONLY,
    [Resource.DOWNTIME]: STANDARD,
  },
  [RoleCode.MACHINE_OPERATOR]: {
    [Resource.PRODUCTION_BATCH]: [Action.VIEW, Action.CREATE, Action.UPDATE],
    [Resource.MACHINE]: [Action.VIEW],
    [Resource.DOWNTIME]: [Action.VIEW, Action.CREATE],
  },

  [RoleCode.QUALITY_MANAGER]: {
    [Resource.QUALITY_INSPECTION]: STANDARD_WITH_DELETE,
    [Resource.PRODUCTION_BATCH]: VIEW_ONLY,
    [Resource.REPORT]: VIEW_ONLY,
  },

  [RoleCode.INVENTORY_MANAGER]: {
    [Resource.STOCK]: STANDARD_WITH_DELETE,
    [Resource.WAREHOUSE]: STANDARD,
    [Resource.PRODUCT]: STANDARD,
    [Resource.MATERIAL]: STANDARD,
    [Resource.DISPATCH]: STANDARD,
    [Resource.REPORT]: VIEW_ONLY,
  },

  [RoleCode.PURCHASE_MANAGER]: {
    [Resource.PURCHASE_ORDER]: STANDARD_WITH_DELETE,
    [Resource.SUPPLIER]: STANDARD_WITH_DELETE,
    [Resource.MATERIAL]: STANDARD,
    [Resource.REPORT]: VIEW_ONLY,
  },

  [RoleCode.MAINTENANCE_MANAGER]: {
    [Resource.MAINTENANCE_JOB]: STANDARD_WITH_DELETE,
    [Resource.MACHINE]: STANDARD,
    [Resource.DOWNTIME]: VIEW_ONLY,
    [Resource.REPORT]: VIEW_ONLY,
  },

  [RoleCode.HR_MANAGER]: {
    [Resource.EMPLOYEE]: STANDARD_WITH_DELETE,
    [Resource.ATTENDANCE]: STANDARD_WITH_DELETE,
    [Resource.PAYROLL]: APPROVAL,
    [Resource.REPORT]: VIEW_ONLY,
  },

  [RoleCode.ACCOUNTANT]: {
    [Resource.COST_SHEET]: STANDARD,
    [Resource.PAYROLL]: STANDARD,
    [Resource.SALES_ORDER]: VIEW_ONLY,
    [Resource.PURCHASE_ORDER]: VIEW_ONLY,
    [Resource.REPORT]: VIEW_ONLY,
  },

  [RoleCode.SALES_MANAGER]: {
    [Resource.SALES_ORDER]: STANDARD_WITH_DELETE,
    [Resource.CUSTOMER]: STANDARD_WITH_DELETE,
    [Resource.DISPATCH]: STANDARD,
    [Resource.PRODUCT]: VIEW_ONLY,
    [Resource.REPORT]: VIEW_ONLY,
  },

  [RoleCode.VIEWER]: Object.fromEntries(Object.values(Resource).map((r) => [r, [Action.VIEW]])) as Record<
    Resource,
    Action[]
  >,
};
