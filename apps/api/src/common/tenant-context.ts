import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantRequestContext {
  userId: string;
  tenantId: string | null; // null only for platform-level users
  isPlatformAdmin: boolean;
  roleCodes: string[];
  /** Set of "resource:action" strings granted via role permissions. */
  allow: Set<string>;
  /** Set of "resource:action" strings explicitly denied for this user (wins over allow). */
  deny: Set<string>;
  factoryIds: string[];
  ipAddress?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<TenantRequestContext>();

/**
 * Request-scoped tenant/permission context, established by TenantContextInterceptor
 * (which wraps the controller call in `run()` — see that class's docstring for why
 * it must be an interceptor using `run()`, not a guard using `enterWith()`) and read
 * by the Prisma tenant-scoping extension and by services via `getOrThrow()`. Backed
 * by AsyncLocalStorage rather than a Nest REQUEST-scoped provider so plain service/
 * repository code (and the Prisma extension itself, which Nest DI doesn't touch) can
 * read it without being wired through the DI graph.
 *
 * See IMPLEMENTATION_DECISIONS.md D-015.
 */
export class TenantContextStore {
  static run<T>(context: TenantRequestContext, fn: () => T): T {
    return storage.run(context, fn);
  }

  static get(): TenantRequestContext | undefined {
    return storage.getStore();
  }

  static getOrThrow(): TenantRequestContext {
    const ctx = storage.getStore();
    if (!ctx) {
      throw new Error('TenantContextStore.getOrThrow() called outside of a request context');
    }
    return ctx;
  }
}
