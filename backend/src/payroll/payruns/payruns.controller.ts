import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { PayrunsService } from './payruns.service';
import { CreatePayrunDto } from './dto/create-payrun.dto';
import { PreviewScopeDto } from './dto/preview-scope.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CheckAbility } from '../../common/decorators/check-ability.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('payroll/payruns')
@UseGuards(JwtAuthGuard)
export class PayrunsController {
  constructor(private readonly payrunsService: PayrunsService) {}

  @Post('preview-scope')
  @CheckAbility({ action: 'read', subject: 'Payrun' })
  async previewScope(@Body() previewScopeDto: PreviewScopeDto) {
    return this.payrunsService.previewScope(previewScopeDto);
  }

  @Get()
  @CheckAbility({ action: 'read', subject: 'Payrun' })
  async findAll() {
    return this.payrunsService.findAll();
  }

  @Get(':id')
  @CheckAbility({ action: 'read', subject: 'Payrun' })
  async findOne(@Param('id') id: string) {
    return this.payrunsService.findOne(id);
  }

  @Post()
  @CheckAbility({ action: 'create', subject: 'Payrun' })
  async create(@Body() createPayrunDto: CreatePayrunDto, @CurrentUser() user: any) {
    return this.payrunsService.create(createPayrunDto, user.id);
  }

  @Post(':id/compute')
  @CheckAbility({ action: 'update', subject: 'Payrun' })
  @HttpCode(HttpStatus.ACCEPTED)
  async compute(@Param('id') id: string) {
    return this.payrunsService.compute(id);
  }

  @Post(':id/validate')
  @CheckAbility({ action: 'update', subject: 'Payrun' })
  @HttpCode(HttpStatus.OK)
  async validate(@Param('id') id: string) {
    return this.payrunsService.validate(id);
  }

  @Post(':id/mark-paid')
  @CheckAbility({ action: 'update', subject: 'Payrun' })
  @HttpCode(HttpStatus.OK)
  async markPaid(@Param('id') id: string) {
    return this.payrunsService.markPaid(id);
  }

  @Post(':id/send-payslips')
  @CheckAbility({ action: 'update', subject: 'Payrun' })
  @HttpCode(HttpStatus.ACCEPTED)
  async sendPayslips(@Param('id') id: string) {
    return this.payrunsService.sendPayslips(id);
  }
}
