import { Module } from '@nestjs/common';
import { SalaryRulesController, SalaryRulesValidationController } from './salary-rules.controller';
import { SalaryRulesService } from './salary-rules.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SalaryRulesController, SalaryRulesValidationController],
  providers: [SalaryRulesService],
  exports: [SalaryRulesService],
})
export class SalaryRulesModule {}
