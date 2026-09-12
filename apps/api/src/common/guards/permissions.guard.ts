import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSION_KEY, RequiredPermission } from '../decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

/**
 * Global guard, registered after JwtAuthGuard. Enforces @RequirePermission()
 * against the caller's role permissions and per-user overrides (SRS §4.2).
 *
 * Reads straight off `request.user` (set by JwtStrategy) rather than the
 * AsyncLocalStorage tenant context: guards run before interceptors in Nest's
 * pipeline, and the ALS context is only entered inside TenantContextInterceptor
 * (see its docstring for why `enterWith()` in a guard doesn't survive into the
 * RxJS-based interceptor/controller chain). Everything this guard needs is
 * already on `request.user` by the time JwtAuthGuard finishes.
 */
@Injectable()
export class PermissionsGuard {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) return false; // shouldn't happen — JwtAuthGuard runs first and would have rejected already

    // No platform-admin bypass here, deliberately: tenant-resource permissions
    // (Resource.FACTORY, Resource.SALES_ORDER, etc.) belong to tenant users only.
    // Platform staff have their own PlatformAdminGuard-gated routes (the `tenants`
    // module) and no role/tenant of their own — routing them through ordinary
    // tenant endpoints would mean cross-tenant access with no tenant to scope by,
    // which is exactly what SRS §22 says must be impossible.
    const key = `${required.resource}:${required.action}`;
    const allowed = !user.deny.includes(key) && user.allow.includes(key);
    if (!allowed) {
      throw new ForbiddenException(`Missing permission: ${required.resource}:${required.action}`);
    }
    return true;
  }
}
