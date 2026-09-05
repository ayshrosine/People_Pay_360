import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: 'localhost',
          port: 6379,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [BullModule],
})
export class JobsModule {}
