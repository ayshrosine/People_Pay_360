import { Module } from '@nestjs/common';
import { SalaryStructuresModule } from './salary-structures/salary-structures.module';
import { SalaryRulesModule } from './salary-rules/salary-rules.module';
import { RuleEngineModule } from './rule-engine/rule-engine.module';
import { PayrunsModule } from './payruns/payruns.module';
import { PayslipsModule } from './payslips/payslips.module';

@Module({
  imports: [
    SalaryStructuresModule,
    SalaryRulesModule,
    RuleEngineModule,
    PayrunsModule,
    PayslipsModule,
  ],
  exports: [
    SalaryStructuresModule,
    SalaryRulesModule,
    RuleEngineModule,
    PayrunsModule,
    PayslipsModule,
  ],
})
export class PayrollModule {}
