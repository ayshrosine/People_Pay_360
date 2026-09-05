import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import * as Sentry from '@sentry/node';
import type { Request } from 'express';
import { RequestUser } from '../abilities/ability.factory';

/**
 * Attaches the authenticated user and the owning module to every Sentry event.
 * In a payroll system an untagged error is nearly useless — you need to know
 * *whose* payroll broke.
 */
@Injectable()
export class SentryContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = request.user;

    if (user) {
      Sentry.setUser({ id: user.id, email: user.email });
      Sentry.setTag('role', user.role);
    }

    // e.g. '/api/v1/payroll/payruns' -> 'payroll'
    const moduleName = request.url?.split('?')[0]?.split('/').filter(Boolean)[2];
    if (moduleName) {
      Sentry.setTag('module', moduleName);
    }

    return next.handle();
  }
}
