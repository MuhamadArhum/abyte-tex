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

export interface AuthenticatedUserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string | null;
  isPlatformAdmin: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'INVITED' | 'LOCKED';
  roles: Array<{ id: string; code: string; name: string }>;
  factoryAccess: Array<{ id: string; name: string; code: string }>;
}
