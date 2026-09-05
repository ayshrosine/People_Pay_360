import { Controller, Get, Post, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { PayslipsService } from './payslips.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CheckAbility } from '../../common/decorators/check-ability.decorator';

@Controller('payroll/payslips')
@UseGuards(JwtAuthGuard)
export class PayslipsController {
  constructor(private readonly payslipsService: PayslipsService) {}

  @Get()
  @CheckAbility({ action: 'read', subject: 'Payslip' })
  async findAll(
    @Query('payrunId') payrunId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
  ) {
    return this.payslipsService.findAll(payrunId, employeeId, status);
  }

  @Get(':id')
  @CheckAbility({ action: 'read', subject: 'Payslip' })
  async findOne(@Param('id') id: string) {
    return this.payslipsService.findOne(id);
  }

  @Get(':id/pdf')
  @CheckAbility({ action: 'read', subject: 'Payslip' })
  async getPdf(@Param('id') id: string) {
    return this.payslipsService.getPdf(id);
  }

  @Post(':id/recompute')
  @CheckAbility({ action: 'update', subject: 'Payslip' })
  @HttpCode(HttpStatus.ACCEPTED)
  async recompute(@Param('id') id: string) {
    return this.payslipsService.recompute(id);
  }
}
