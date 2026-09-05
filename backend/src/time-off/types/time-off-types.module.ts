import { Module } from '@nestjs/common';
import { TimeOffTypesController } from './time-off-types.controller';
import { TimeOffTypesService } from './time-off-types.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TimeOffTypesController],
  providers: [TimeOffTypesService],
  exports: [TimeOffTypesService],
})
export class TimeOffTypesModule {}
