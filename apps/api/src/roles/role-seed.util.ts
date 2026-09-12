import { Prisma, PrismaClient } from '@prisma/client';
import { DEFAULT_ROLE_PERMISSIONS, RoleCode, TENANT_ROLE_CODES } from '../common/rbac.constants';

type TxClient = Prisma.TransactionClient | PrismaClient;

/**
 * Seeds the standard tenant-level role catalog (SRS §4.1) with its default
 * permission grants for a newly-created tenant, and returns the created roles
 * keyed by code so the caller can immediately assign one (e.g. COMPANY_OWNER) to
 * the tenant's first user.
 */
export async function seedTenantRoles(tx: TxClient, tenantId: string): Promise<Record<RoleCode, { id: string }>> {
  const result = {} as Record<RoleCode, { id: string }>;

  for (const code of TENANT_ROLE_CODES) {
    const permissions = DEFAULT_ROLE_PERMISSIONS[code] ?? {};
    const permissionRows = Object.entries(permissions).flatMap(([resource, actions]) =>
      (actions ?? []).map((action) => ({ resource, action })),
    );

    const role = await tx.role.create({
      data: {
        tenantId,
        code,
        name: humanizeRoleCode(code),
        isSystem: true,
        permissions: { createMany: { data: permissionRows } },
      },
      select: { id: true },
    });

    result[code] = role;
  }

  return result;
}

function humanizeRoleCode(code: string): string {
  return code
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}
