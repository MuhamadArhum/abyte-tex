import { Injectable, OnModuleDestroy, OnModuleInit, ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantContextStore } from '../common/tenant-context';
import {
  CREATE_MANY_OPERATIONS,
  DATA_SCOPED_OPERATIONS,
  TENANT_SCOPED_MODELS,
  WHERE_SCOPED_OPERATIONS,
} from './tenant-scoped-models';

/**
 * Wraps PrismaClient with a query extension that auto-injects the current request's
 * tenantId into every operation against a tenant-scoped model — see
 * IMPLEMENTATION_DECISIONS.md D-015. Inject `PrismaService` (not `PrismaClient`
 * directly) everywhere in application code; `.raw` is reserved for platform-level
 * code (the tenants module) that legitimately needs cross-tenant access.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  /** Unscoped client — bypasses tenant injection entirely. Use ONLY for platform-admin flows. */
  public readonly raw: PrismaClient;
  /** Tenant-scoped client — use this for all normal application code. */
  public readonly db: ReturnType<PrismaService['buildScopedClient']>;

  constructor() {
    this.raw = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
    this.db = this.buildScopedClient(this.raw);
  }

  private buildScopedClient(client: PrismaClient) {
    return client.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!model || !TENANT_SCOPED_MODELS.has(model as Prisma.ModelName)) {
              return query(args);
            }

            const ctx = TenantContextStore.get();
            if (!ctx) {
              // Background jobs / seed scripts must use `prisma.raw` explicitly instead
              // of hitting this path with no request context.
              throw new ForbiddenException(
                `Tenant-scoped operation "${String(model)}.${operation}" attempted with no request context`,
              );
            }
            if (!ctx.tenantId) {
              // Deliberately includes platform admins: they have no tenantId, and
              // tenant-scoped models must never be reachable through `.db` without
              // one — even for a platform admin. Cross-tenant access for legitimate
              // platform operations goes through `.raw` explicitly (tenants module
              // only), never through an auto-bypass here. See D-015.
              throw new ForbiddenException('No tenant context available for this user');
            }

            const scopedArgs = injectTenantId(operation, args, ctx.tenantId);
            return query(scopedArgs);
          },
        },
      },
    });
  }

  async onModuleInit() {
    await this.raw.$connect();
  }

  async onModuleDestroy() {
    await this.raw.$disconnect();
  }
}

function injectTenantId(operation: string, args: any, tenantId: string): any {
  const next = { ...(args ?? {}) };

  if (operation === 'upsert') {
    return {
      ...next,
      where: { ...(next.where ?? {}), tenantId },
      create: { ...(next.create ?? {}), tenantId },
      update: { ...(next.update ?? {}), tenantId },
    };
  }

  if (CREATE_MANY_OPERATIONS.has(operation)) {
    const data = Array.isArray(next.data) ? next.data : [];
    return { ...next, data: data.map((row: Record<string, unknown>) => ({ ...row, tenantId })) };
  }

  if (DATA_SCOPED_OPERATIONS.has(operation)) {
    return { ...next, data: { ...(next.data ?? {}), tenantId } };
  }

  if (WHERE_SCOPED_OPERATIONS.has(operation)) {
    return { ...next, where: { ...(next.where ?? {}), tenantId } };
  }

  return next;
}
