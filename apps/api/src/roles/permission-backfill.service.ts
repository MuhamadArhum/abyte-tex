import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_ROLE_PERMISSIONS, RoleCode, TENANT_ROLE_CODES } from '../common/rbac.constants';

/**
 * Every tenant's system roles get their permission rows written ONCE, at
 * `seedTenantRoles` time (role-seed.util.ts), from whatever
 * `DEFAULT_ROLE_PERMISSIONS` looked like at that moment. When a new `Resource`
 * is added to the catalog later (e.g. `SHIFT`, added mid-project), every
 * tenant created before that point is stuck forever with no permission rows
 * for it — RBAC silently hides the new module from them, with no error and no
 * static check that could catch it (found live: the demo tenant's
 * COMPANY_OWNER, which is defined as "every action on every resource," had
 * zero `shift:*` rows after `SHIFT` was added).
 *
 * This runs once at API boot and additively fills in any (resource, action)
 * pairs a system role is missing relative to its current default — via
 * `skipDuplicates`, so it never touches a row that already exists, meaning it
 * can never clobber a tenant's customization of a non-Company-Owner role.
 */
@Injectable()
export class PermissionBackfillService implements OnModuleInit {
  private readonly logger = new Logger(PermissionBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const roles = await this.prisma.raw.role.findMany({
      where: { isSystem: true, code: { in: [...TENANT_ROLE_CODES] } },
      select: { id: true, code: true },
    });

    const rows = roles.flatMap(({ id, code }) => {
      const defaults = DEFAULT_ROLE_PERMISSIONS[code as RoleCode] ?? {};
      return Object.entries(defaults).flatMap(([resource, actions]) =>
        (actions ?? []).map((action) => ({ roleId: id, resource, action })),
      );
    });

    if (rows.length === 0) return;

    const result = await this.prisma.raw.permission.createMany({ data: rows, skipDuplicates: true });
    if (result.count > 0) {
      this.logger.log(
        `Backfilled ${result.count} missing role-permission row(s) across ${roles.length} tenant role(s)`,
      );
    }
  }
}
