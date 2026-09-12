import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextStore } from '../tenant-context';
import { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

/**
 * Establishes the AsyncLocalStorage tenant/permission context that the Prisma
 * tenant-scoping extension (D-015) and services (`TenantContextStore.getOrThrow()`)
 * rely on for the rest of the request.
 *
 * This MUST be an interceptor, not a guard, and it must use `TenantContextStore.run()`
 * — not `enterWith()` — wrapping the actual `next.handle().subscribe()` call inside a
 * manually-constructed Observable. Two things that look equivalent are not:
 *
 *   - A guard calling `enterWith()` looked correct but silently failed: guards run
 *     before Nest's RxJS interceptor/handler pipeline, and Nest doesn't subscribe to
 *     the resulting Observable synchronously within the guard's call stack — by the
 *     time the controller method (and therefore any Prisma call) actually executes,
 *     the "current execution context" enterWith mutated has already unwound.
 *   - Calling `next.handle()` first and only wrapping the subscription doesn't work
 *     either — `next.handle()` is lazy, but if the `.subscribe()` isn't itself inside
 *     the `run()` callback, the controller method (which fires on subscribe) still
 *     runs outside the entered context.
 *
 * Wrapping `next.handle().subscribe(subscriber)` inside `TenantContextStore.run()`
 * guarantees the controller method's synchronous kick-off — and everything it awaits
 * from there — happens inside the active context, which is what AsyncLocalStorage
 * actually needs to follow the request through services and into Prisma.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      // Public route with no authenticated user (e.g. health check) — nothing to establish.
      return next.handle();
    }

    return new Observable((subscriber) => {
      TenantContextStore.run(
        {
          userId: user.userId,
          tenantId: user.tenantId,
          isPlatformAdmin: user.isPlatformAdmin,
          roleCodes: user.roleCodes,
          allow: new Set(user.allow),
          deny: new Set(user.deny),
          factoryIds: user.factoryIds,
          ipAddress: request.ip,
          userAgent: request.headers?.['user-agent'],
        },
        () => {
          next.handle().subscribe(subscriber);
        },
      );
    });
  }
}
