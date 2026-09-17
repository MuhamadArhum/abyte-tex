import { ForbiddenException } from '@nestjs/common';
import { TenantRequestContext } from './tenant-context';

/**
 * P0 remediation (RBAC-001): `UserFactoryAccess` was computed into the request
 * context (`ctx.factoryIds`) on every request but was never actually checked by
 * any service — a user restricted to Factory 01 could read/act on every other
 * factory in their own tenant. This is the single enforcement point every
 * factory-scoped service now calls before returning or mutating a
 * factory-scoped resource.
 *
 * An empty `factoryIds` array means "no explicit restriction" — this is the
 * existing, correct behavior for Company Owner/Admin (and any other role with
 * no `UserFactoryAccess` rows), who are meant to retain access to every
 * factory in their tenant. A non-empty array is treated as an explicit
 * allow-list: only those factories are reachable.
 *
 * `factoryId` may be `null`/`undefined` for call sites where the resource
 * itself is optionally factory-scoped (e.g. a tenant-wide list with no filter
 * applied) — those callers are responsible for narrowing the query instead
 * (see `factoryScopeFilter` below), so this function is a no-op in that case
 * rather than throwing.
 */
export function assertFactoryAccess(
  ctx: Pick<TenantRequestContext, 'factoryIds'>,
  factoryId: string | null | undefined,
): void {
  if (!factoryId) return;
  if (ctx.factoryIds.length === 0) return;
  if (!ctx.factoryIds.includes(factoryId)) {
    throw new ForbiddenException('You do not have access to this factory');
  }
}

/**
 * Builds the `factoryId` clause for a list/aggregate query. When the caller
 * passes an explicit `factoryId` (already validated via `assertFactoryAccess`
 * above), that takes precedence. Otherwise, if the user's access is
 * restricted to specific factories, the query is narrowed to exactly those —
 * an unfiltered tenant-wide list must not silently return every factory's
 * data to a factory-restricted user.
 */
export function factoryScopeFilter(
  ctx: Pick<TenantRequestContext, 'factoryIds'>,
  factoryId?: string | null,
): { factoryId?: string | { in: string[] } } {
  if (factoryId) return { factoryId };
  if (ctx.factoryIds.length > 0) return { factoryId: { in: ctx.factoryIds } };
  return {};
}
