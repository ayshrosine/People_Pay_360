import { Module } from '@nestjs/common';
import { TimeOffAllocationsController } from './time-off-allocations.controller';
import { TimeOffAllocationsService } from './time-off-allocations.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TimeOffAllocationsController],
  providers: [TimeOffAllocationsService],
  exports: [TimeOffAllocationsService],
})
export class TimeOffAllocationsModule {}
