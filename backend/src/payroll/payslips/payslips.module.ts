import { Module } from '@nestjs/common';
import { PayslipsController } from './payslips.controller';
import { PayslipsService } from './payslips.service';
import { PayslipComputationService } from './payslip-computation.service';
import { PayslipPdfService } from './payslip-pdf.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';
import { FilesModule } from '../../files/files.module';

@Module({
  imports: [PrismaModule, RuleEngineModule, FilesModule],
  controllers: [PayslipsController],
  providers: [PayslipsService, PayslipComputationService, PayslipPdfService],
  exports: [PayslipsService, PayslipComputationService],
})
export class PayslipsModule {}
