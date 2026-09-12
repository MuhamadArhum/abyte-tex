import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

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

/**
 * Wraps every successful response in a consistent `{ data, meta? }` envelope (SRS
 * §17.7). Controllers that already return `{ data, meta }` (paginated list
 * endpoints) pass through unchanged; everything else gets wrapped.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessEnvelope<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<SuccessEnvelope<T>> {
    return next.handle().pipe(
      map((payload: any) => {
        if (payload && typeof payload === 'object' && 'data' in payload && 'meta' in payload) {
          return payload as SuccessEnvelope<T>;
        }
        return { data: payload };
      }),
    );
  }
}
