import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { SalaryRulesService } from './salary-rules.service';
import { CreateSalaryRuleDto } from './dto/create-salary-rule.dto';
import { UpdateSalaryRuleDto } from './dto/update-salary-rule.dto';
import { ValidateRuleDto } from './dto/validate-rule.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CheckAbility } from '../../common/decorators/check-ability.decorator';

@Controller('payroll/structures/:structureId/rules')
@UseGuards(JwtAuthGuard)
export class SalaryRulesController {
  constructor(private readonly salaryRulesService: SalaryRulesService) {}

  @Get()
  @CheckAbility({ action: 'read', subject: 'SalaryRule' })
  async findAll(@Param('structureId') structureId: string) {
    return this.salaryRulesService.findAll(structureId);
  }

  @Get(':ruleId')
  @CheckAbility({ action: 'read', subject: 'SalaryRule' })
  async findOne(@Param('ruleId') ruleId: string) {
    return this.salaryRulesService.findOne(ruleId);
  }

  @Post()
  @CheckAbility({ action: 'create', subject: 'SalaryRule' })
  async create(@Param('structureId') structureId: string, @Body() createSalaryRuleDto: CreateSalaryRuleDto) {
    return this.salaryRulesService.create(structureId, createSalaryRuleDto);
  }

  @Patch(':ruleId')
  @CheckAbility({ action: 'update', subject: 'SalaryRule' })
  async update(@Param('ruleId') ruleId: string, @Body() updateSalaryRuleDto: UpdateSalaryRuleDto) {
    return this.salaryRulesService.update(ruleId, updateSalaryRuleDto);
  }

  @Delete(':ruleId')
  @CheckAbility({ action: 'delete', subject: 'SalaryRule' })
  async remove(@Param('ruleId') ruleId: string) {
    return this.salaryRulesService.remove(ruleId);
  }
}

@Controller('payroll/rules')
@UseGuards(JwtAuthGuard)
export class SalaryRulesValidationController {
  constructor(private readonly salaryRulesService: SalaryRulesService) {}

  @Post('validate')
  @CheckAbility({ action: 'read', subject: 'SalaryRule' })
  async validateRule(@Body() validateRuleDto: ValidateRuleDto) {
    return this.salaryRulesService.validateRule(validateRuleDto);
  }
}
