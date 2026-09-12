import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Action, Resource } from '../common/rbac.constants';

export interface SetRolePermissionsInput {
  permissions: Array<{ resource: Resource; action: Action }>;
}

/**
 * Role catalog is seeded per tenant on tenant creation (role-seed.util.ts). This
 * module exposes read access plus per-role permission tuning (SRS §4.2 —
 * "configurable RBAC"); creating brand-new custom roles is Phase 2.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listRoles() {
    return this.prisma.db.role.findMany({
      include: { permissions: true, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getRoleById(id: string) {
    const role = await this.prisma.db.role.findUnique({ where: { id }, include: { permissions: true } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async setRolePermissions(id: string, input: SetRolePermissionsInput) {
    const role = await this.getRoleById(id);

    if (role.code === 'COMPANY_OWNER') {
      throw new NotFoundException('The Company Owner role cannot be modified');
    }

    await this.prisma.raw.$transaction([
      this.prisma.raw.permission.deleteMany({ where: { roleId: id } }),
      this.prisma.raw.permission.createMany({
        data: input.permissions.map((p) => ({ roleId: id, resource: p.resource, action: p.action })),
      }),
    ]);

    await this.auditService.log({
      action: 'PERMISSION_CHANGE',
      entityType: 'Role',
      entityId: id,
      oldValue: { permissions: role.permissions },
      newValue: { permissions: input.permissions },
    });

    return this.getRoleById(id);
  }
}
