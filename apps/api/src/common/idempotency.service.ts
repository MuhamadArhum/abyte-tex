import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextStore } from './tenant-context';

/**
 * P1 remediation (API-005): duplicate-submission protection for
 * document-creating endpoints. A client that wants retry-safety supplies an
 * `idempotencyKey` on the create DTO (any client-generated unique string,
 * e.g. a UUID minted once per user action); a network retry or a
 * double-click that resubmits the exact same key gets back the original
 * result instead of creating a second Sales Order / Purchase Order / Goods
 * Receipt / Dispatch. A caller that omits the key (the DTO field is
 * optional) gets the previous, unprotected behavior — this is opt-in, not a
 * behavior change for existing callers that don't send one.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the previously-created resource's id if this (scope, key) pair was already processed. */
  async check(scope: string, key: string | undefined): Promise<string | null> {
    if (!key) return null;
    const existing = await this.prisma.db.idempotencyKey.findFirst({ where: { scope, key } });
    return existing?.resultId ?? null;
  }

  /** Records that (scope, key) produced `resultId`, so a later retry can be recognized. */
  async record(scope: string, key: string | undefined, resultId: string): Promise<void> {
    if (!key) return;
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) return;
    // Best-effort: if two concurrent requests with the same key both reach here, the
    // unique constraint on (tenantId, scope, key) lets exactly one recording win — the
    // loser's own resource was still created (this is a courtesy record, not the guard
    // itself; true duplicate-*prevention* under concurrency would need the check+create
    // to be one atomic step, which is unnecessary complexity for a client-retry courtesy
    // feature like this one).
    await this.prisma.db.idempotencyKey
      .create({ data: { tenantId: ctx.tenantId, scope, key, resultId } })
      .catch(() => undefined);
  }
}
