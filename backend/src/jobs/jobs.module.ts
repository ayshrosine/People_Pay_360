import { Module, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

const logger = new Logger('JobsModule');

/**
 * BullMQ is optional. Payroll computation runs inline in `PayrunsService`, so a
 * deployment without Redis (Neon + Cloudflare, for instance) still works end to
 * end; when REDIS_URL is present the queue infrastructure is registered so
 * background processors can be added without touching call sites.
 */
const queueImports = process.env.REDIS_URL
  ? [
      BullModule.forRootAsync({
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => {
          const url = configService.get<string>('REDIS_URL')!;
          const parsed = new URL(url);
          return {
            connection: {
              host: parsed.hostname,
              port: Number(parsed.port || 6379),
              username: parsed.username || undefined,
              password: parsed.password || undefined,
              // Managed Redis (Upstash, Redis Cloud) requires TLS on rediss://.
              tls: parsed.protocol === 'rediss:' ? {} : undefined,
              maxRetriesPerRequest: null,
            },
          };
        },
        inject: [ConfigService],
      }),
    ]
  : [];

if (!process.env.REDIS_URL) {
  logger.log('REDIS_URL is not set - background queues are disabled, payroll computes inline.');
}

@Module({
  imports: queueImports,
  exports: queueImports,
})
export class JobsModule {}
