import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextStore } from '../common/tenant-context';

export interface AuditLogInput {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  /** Any JSON-serializable value; Dates/Decimals are stringified automatically. */
  oldValue?: unknown;
  newValue?: unknown;
}

/** Round-trips through JSON so Date/Decimal/etc. become plain serializable values before hitting Prisma's Json column. */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Records significant user/system activity per SRS §15.2 (login/logout, create,
 * update, delete, approve, reject, export, permission changes, config changes).
 * Called explicitly at the meaningful point in each service rather than derived
 * generically from every HTTP call, so entries carry real business context
 * (old/new values) instead of just "PATCH /api/v1/production-orders/123".
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    const ctx = TenantContextStore.get();

    await this.prisma.raw.auditLog.create({
      data: {
        tenantId: ctx?.tenantId ?? null,
        userId: ctx?.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        oldValue: toJson(input.oldValue),
        newValue: toJson(input.newValue),
        ipAddress: ctx?.ipAddress,
        userAgent: ctx?.userAgent,
      },
    });
  }
}
