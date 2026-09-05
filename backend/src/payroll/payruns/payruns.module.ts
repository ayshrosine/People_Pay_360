import { Module } from '@nestjs/common';
import { PayrunsController } from './payruns.controller';
import { PayrunsService } from './payruns.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PayslipsModule } from '../payslips/payslips.module';

@Module({
  imports: [PrismaModule, PayslipsModule],
  controllers: [PayrunsController],
  providers: [PayrunsService],
  exports: [PayrunsService],
})
export class PayrunsModule {}
