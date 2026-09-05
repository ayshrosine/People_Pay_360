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
    .setTitle('PeoplePay360 API')
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

void bootstrap();
