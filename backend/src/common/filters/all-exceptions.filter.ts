import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  message: unknown;
  code?: string;
  errors?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toErrorBody(exception);

    // Only real server faults are worth a Sentry issue; 4xx validation noise is not.
    if (body.statusCode >= 500) {
      Sentry.captureException(exception);
      this.logger.error(
        `${request.method} ${request.url} -> ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(body.statusCode).json({
      ...body,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private toErrorBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'object' && payload !== null) {
        const record = payload as Record<string, unknown>;
        return {
          statusCode: status,
          message: record.message ?? exception.message,
          code: typeof record.code === 'string' ? record.code : undefined,
          errors: record.errors,
        };
      }

      return { statusCode: status, message: payload };
    }

    // Translate Prisma failures into the business error codes the frontend branches on.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          const target = (exception.meta?.target as string[] | undefined)?.join(', ');
          const isPayslip = target?.includes('payrunId') && target?.includes('employeeId');
          return {
            statusCode: HttpStatus.CONFLICT,
            code: isPayslip ? 'DUPLICATE_PAYSLIP' : 'UNIQUE_CONSTRAINT_VIOLATION',
            message: target
              ? `A record with this ${target} already exists.`
              : 'A record with these values already exists.',
          };
        }
        case 'P2003':
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            code: 'FOREIGN_KEY_VIOLATION',
            message: 'A referenced record does not exist.',
          };
        case 'P2025':
          return {
            statusCode: HttpStatus.NOT_FOUND,
            code: 'NOT_FOUND',
            message: 'The requested record was not found.',
          };
        default:
          break;
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'INVALID_QUERY',
        message: 'The request could not be processed as written.',
      };
    }

    // Raised by the `no_overlapping_running_contracts` GiST exclusion constraint.
    if (
      exception instanceof Error &&
      /no_overlapping_running_contracts/i.test(exception.message)
    ) {
      return {
        statusCode: HttpStatus.CONFLICT,
        code: 'OVERLAPPING_CONTRACT',
        message: 'This employee already has an active contract covering this period.',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}
