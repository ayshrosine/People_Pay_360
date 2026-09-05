import { Module, ValidationPipe, BadRequestException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ValidationError } from 'class-validator';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AbilitiesGuard } from './common/guards/abilities.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { SentryContextInterceptor } from './common/interceptors/sentry-context.interceptor';
import { CommonModule } from './common/common.module';
import { validate } from './config/env.validation';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmployeesModule } from './employees/employees.module';
import { WorkingSchedulesModule } from './working-schedules/working-schedules.module';
import { ContractsModule } from './contracts/contracts.module';
import { AttendanceModule } from './attendance/attendance.module';
import { TimeOffModule } from './time-off/time-off.module';
import { PayrollModule } from './payroll/payroll.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FilesModule } from './files/files.module';
import { JobsModule } from './jobs/jobs.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    CommonModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    EmployeesModule,
    WorkingSchedulesModule,
    ContractsModule,
    AttendanceModule,
    TimeOffModule,
    PayrollModule,
    DashboardModule,
    FilesModule,
    JobsModule,
  ],
  providers: [
    // Guard order matters: authenticate first so `request.user` exists by the
    // time the ability guard reads it.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AbilitiesGuard },

    { provide: APP_FILTER, useClass: AllExceptionsFilter },

    { provide: APP_INTERCEPTOR, useClass: SentryContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },

    {
      // Previously registered under the string 'APP_PIPE' rather than the token
      // exported by @nestjs/core, so DTO validation never actually ran.
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
        exceptionFactory: (errors: ValidationError[]) =>
          new BadRequestException({
            message: 'Validation failed',
            code: 'VALIDATION_FAILED',
            errors: errors.map((error) => ({
              field: error.property,
              constraints: Object.values(error.constraints ?? {}),
            })),
          }),
      }),
    },
  ],
})
export class AppModule {}
