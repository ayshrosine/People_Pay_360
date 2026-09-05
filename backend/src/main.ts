import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { AppModule } from './app.module';

async function bootstrap() {
  // Initialize Sentry
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'development',
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 1.0),
    profilesSampleRate: 1.0,
  });

  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Swagger documentation
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
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
