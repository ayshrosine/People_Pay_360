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
        // `undefined` means the handler produced no body at all (a 204), so
        // leave it alone. `null` is a real answer - "there is no attendance
        // record today" - and must still arrive as `{ data: null }`, otherwise
        // the response body is empty and every client reads it as undefined.
        if (payload === undefined) {
          return payload;
        }
        if (payload === null) {
          return { data: null };
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
