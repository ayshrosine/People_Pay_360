import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { PayslipStatus } from '@prisma/client';
import { PayslipsService } from './payslips.service';
import { CheckAbility } from '../../common/decorators/check-ability.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/abilities/ability.factory';
import {
  assertOwnsEmployeeRecord,
  resolveEmployeeScope,
} from '../../common/guards/scope.util';

@ApiTags('payroll')
@ApiBearerAuth()
@Controller('payroll/payslips')
export class PayslipsController {
  constructor(private readonly payslipsService: PayslipsService) {}

  @Get()
  @CheckAbility({ action: 'read', subject: 'Payslip' })
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query('payrunId') payrunId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: PayslipStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.payslipsService.findAll({
      payrunId,
      // An employee may only ever list their own payslips.
      employeeId: resolveEmployeeScope(user, employeeId),
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @CheckAbility({ action: 'read', subject: 'Payslip' })
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const payslip = await this.payslipsService.findOne(id);
    assertOwnsEmployeeRecord(user, payslip.employeeId);
    return this.payslipsService.findOne(id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Returns a URL to the payslip PDF, generating it if needed' })
  @CheckAbility({ action: 'read', subject: 'Payslip' })
  async getPdf(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const payslip = await this.payslipsService.findOne(id);
    assertOwnsEmployeeRecord(user, payslip.employeeId);
    return this.payslipsService.getPdf(id);
  }

  @Get(':id/pdf/download')
  @ApiOperation({ summary: 'Streams the payslip PDF directly (no object storage required)' })
  @CheckAbility({ action: 'read', subject: 'Payslip' })
  async downloadPdf(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const payslip = await this.payslipsService.findOne(id);
    assertOwnsEmployeeRecord(user, payslip.employeeId);

    const buffer = await this.payslipsService.renderPdfBuffer(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payslip-${id}.pdf"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  @Get(':id/explain')
  @ApiOperation({ summary: 'Plain-English explanation of how this payslip was computed' })
  @CheckAbility({ action: 'read', subject: 'Payslip' })
  async explain(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const payslip = await this.payslipsService.findOne(id);
    assertOwnsEmployeeRecord(user, payslip.employeeId);
    return this.payslipsService.explain(id);
  }

  @Post(':id/recompute')
  @CheckAbility({ action: 'update', subject: 'Payslip' })
  @HttpCode(HttpStatus.OK)
  async recompute(@Param('id') id: string) {
    return this.payslipsService.recompute(id);
  }
}
