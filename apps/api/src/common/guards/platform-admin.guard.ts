import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

/**
 * Restricts a route to AbyteSol platform staff (Super Admin / Support Admin) —
 * used for platform-level tenant provisioning, never for tenant-owned data.
 *
 * Reads `request.user` directly rather than the AsyncLocalStorage tenant context:
 * this is a guard, and guards run before TenantContextInterceptor establishes that
 * context (see its docstring). `request.user.isPlatformAdmin` is already set by
 * JwtStrategy by the time this guard runs.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user?.isPlatformAdmin) {
      throw new ForbiddenException('This action requires AbyteSol platform administrator access');
    }
    return true;
  }
}
