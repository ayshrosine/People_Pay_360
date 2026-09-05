import { plainToInstance, Transform } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsBoolean, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  DATABASE_URL: string;

  @IsString()
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsString()
  JWT_ACCESS_EXPIRY: string;

  @IsString()
  JWT_REFRESH_EXPIRY: string;

  @IsString()
  REDIS_URL: string;

  @IsString()
  R2_ACCOUNT_ID: string;

  @IsString()
  R2_ACCESS_KEY_ID: string;

  @IsString()
  R2_SECRET_ACCESS_KEY: string;

  @IsString()
  R2_BUCKET_NAME: string;

  @IsString()
  R2_ENDPOINT: string;

  @IsOptional()
  @IsString()
  R2_PUBLIC_URL?: string;

  @IsString()
  RESEND_API_KEY: string;

  @IsString()
  EMAIL_FROM: string;

  @IsString()
  SENTRY_DSN: string;

  @IsString()
  SENTRY_ENVIRONMENT: string;

  @IsString()
  SENTRY_TRACES_SAMPLE_RATE: string;

  @IsString()
  CORS_ORIGIN: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
