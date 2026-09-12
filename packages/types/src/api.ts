/** Matches apps/api/src/common/interceptors/response.interceptor.ts. */
export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SuccessEnvelope<T> {
  data: T;
  meta?: PaginatedMeta;
}

/** Matches apps/api/src/common/filters/all-exceptions.filter.ts. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

export interface LoginResponseUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string | null;
  isPlatformAdmin: boolean;
}

/** Matches apps/api/src/auth/strategies/jwt.strategy.ts AuthenticatedUser — returned by GET /auth/session. */
export interface Session {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string | null;
  isPlatformAdmin: boolean;
  roleCodes: string[];
  allow: string[]; // "resource:action"
  deny: string[];
  factoryIds: string[];
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'INVITED' | 'LOCKED';
  lastLoginAt: string | null;
  createdAt: string;
  roles: Array<{ role: { id: string; code: string; name: string } }>;
  factoryAccess: Array<{ factory: { id: string; name: string; code: string } }>;
}
