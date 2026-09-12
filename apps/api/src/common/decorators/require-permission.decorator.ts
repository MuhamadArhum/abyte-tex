import { SetMetadata } from '@nestjs/common';
import { Action, Resource } from '../rbac.constants';

export const PERMISSION_KEY = 'requiredPermission';

export interface RequiredPermission {
  resource: Resource;
  action: Action;
}

/**
 * Declares the (resource, action) a route requires — enforced by PermissionsGuard
 * against the caller's role permissions and per-user overrides (SRS §4.2).
 */
export const RequirePermission = (resource: Resource, action: Action) =>
  SetMetadata(PERMISSION_KEY, { resource, action } satisfies RequiredPermission);
