import { Module } from '@nestjs/common';
import { PayslipsController } from './payslips.controller';
import { PayslipsService } from './payslips.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PayslipsController],
  providers: [PayslipsService],
  exports: [PayslipsService],
})
export class PayslipsModule {}
