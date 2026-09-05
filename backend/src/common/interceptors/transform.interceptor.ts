import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

/**
 * Normalises every successful response to `{ data, meta? }`, which is the shape
 * the frontend's list/detail hooks are built against.
 *
 * Services that already paginate return `{ data, meta }` themselves; those are
 * passed through untouched rather than being double-wrapped as
 * `{ data: { data, meta } }`.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((payload) => {
        // Binary/stream responses and empty 204s must not be wrapped.
        if (payload instanceof StreamableFile || Buffer.isBuffer(payload)) {
          return payload;
        }
        if (payload === undefined || payload === null) {
          return payload;
        }

        if (
          typeof payload === 'object' &&
          !Array.isArray(payload) &&
          'data' in payload &&
          'meta' in payload
        ) {
          return payload;
        }

        return { data: payload };
      }),
    );
  }
}
