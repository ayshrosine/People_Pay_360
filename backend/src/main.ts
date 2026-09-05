import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { writeFileSync } from 'node:fs';
import { AppModule } from './app.module';

// Sentry must be initialised before the Nest application is created so that
// its instrumentation can patch the runtime first. It is a no-op without a DSN.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 1.0),
    profilesSampleRate: 1.0,
  });
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Multiple origins may be supplied comma-separated (local dev + deployed frontend).
  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Odoo PNX API')
    .setDescription('HR & Payroll Management System API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('employees', 'Employee management')
    .addTag('departments', 'Department management')
    .addTag('contracts', 'Contract management')
    .addTag('working-schedules', 'Working schedule management')
    .addTag('attendance', 'Attendance tracking')
    .addTag('time-off', 'Time off management')
    .addTag('payroll', 'Payroll management')
    .addTag('dashboard', 'Dashboard analytics')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  // Emitting the spec to disk lets the frontend regenerate its typed client
  // (`npm run codegen`) without the API having to be running.
  if (process.env.NODE_ENV !== 'production') {
    try {
      writeFileSync('openapi.json', JSON.stringify(document, null, 2));
    } catch {
      /* non-fatal: the spec is still served over HTTP */
    }
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  logger.log(`API listening on http://localhost:${port}/api/v1`);
  logger.log(`Swagger UI   http://localhost:${port}/api/docs`);
  logger.log(`OpenAPI JSON http://localhost:${port}/api/docs-json`);
}

/**
 * A failure here means the process never starts listening, which a load
 * balancer reports as a 502 with no clue as to why. Print the reason plainly
 * and exit non-zero, so the runtime log says what is actually wrong - almost
 * always a missing DATABASE_URL or JWT secret, which `validate()` rejects on
 * purpose rather than booting into a broken state.
 */
bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // console, not the Nest logger: the app may have failed before one exists.
  console.error('\nFATAL: the API could not start.\n');
  console.error(message);

  // Only suggest the configuration when the failure actually looks like
  // configuration. Printing this unconditionally sent a reader hunting for a
  // missing DATABASE_URL when the real problem was a Prisma engine mismatch.
  if (/environment configuration|DATABASE_URL|JWT_/i.test(message)) {
    console.error('\nRequired: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET.\n');
  }

  process.exit(1);
});
