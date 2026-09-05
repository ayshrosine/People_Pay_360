import { Module } from '@nestjs/common';
import { WorkingSchedulesController } from './working-schedules.controller';
import { WorkingSchedulesService } from './working-schedules.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WorkingSchedulesController],
  providers: [WorkingSchedulesService],
  exports: [WorkingSchedulesService],
})
export class WorkingSchedulesModule {}
