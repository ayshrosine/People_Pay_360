import { plainToInstance } from 'class-transformer';
import { IsOptional, IsString, MinLength, validateSync } from 'class-validator';

/**
 * Only the variables the app genuinely cannot start without are required.
 *
 * Redis, Cloudflare R2, Resend and Sentry are all optional integrations: the
 * services that use them degrade gracefully when they are absent, so requiring
 * them here would stop a local or preview deployment from booting at all.
 */
export class EnvironmentVariables {
  @IsString()
  @MinLength(1)
  DATABASE_URL: string;

  @IsString()
  @MinLength(16, { message: 'JWT_ACCESS_SECRET must be at least 16 characters' })
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(16, { message: 'JWT_REFRESH_SECRET must be at least 16 characters' })
  JWT_REFRESH_SECRET: string;

  @IsOptional() @IsString() JWT_ACCESS_EXPIRY?: string;
  @IsOptional() @IsString() JWT_REFRESH_EXPIRY?: string;

  @IsOptional() @IsString() REDIS_URL?: string;

  @IsOptional() @IsString() R2_ACCOUNT_ID?: string;
  @IsOptional() @IsString() R2_ACCESS_KEY_ID?: string;
  @IsOptional() @IsString() R2_SECRET_ACCESS_KEY?: string;
  @IsOptional() @IsString() R2_BUCKET_NAME?: string;
  @IsOptional() @IsString() R2_ENDPOINT?: string;
  @IsOptional() @IsString() R2_PUBLIC_URL?: string;

  @IsOptional() @IsString() RESEND_API_KEY?: string;
  @IsOptional() @IsString() EMAIL_FROM?: string;

  @IsOptional() @IsString() SENTRY_DSN?: string;
  @IsOptional() @IsString() SENTRY_ENVIRONMENT?: string;
  @IsOptional() @IsString() SENTRY_TRACES_SAMPLE_RATE?: string;

  @IsOptional() @IsString() CORS_ORIGIN?: string;
  @IsOptional() @IsString() PORT?: string;
  @IsOptional() @IsString() NODE_ENV?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    // Keep unknown vars (PATH, etc.) so ConfigService still exposes them.
    excludeExtraneousValues: false,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    whitelist: false,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${details}`);
  }

  return config;
}
