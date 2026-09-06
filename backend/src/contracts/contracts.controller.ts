import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../common/decorators/check-ability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/abilities/ability.factory';

@Controller('contracts')
@UseGuards(JwtAuthGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @CheckAbility({ action: 'read', subject: 'Contract' })
  async findAll(@CurrentUser() user: RequestUser, @Query('employeeId') employeeId?: string) {
    return this.contractsService.findAll(employeeId, user);
  }

  @Get('active')
  @CheckAbility({ action: 'read', subject: 'Contract' })
  async getActiveContract(@Query('employeeId') employeeId: string, @Query('date') date?: string) {
    return this.contractsService.getActiveContract(employeeId, date);
  }

  @Get(':id')
  @CheckAbility({ action: 'read', subject: 'Contract' })
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.contractsService.findOne(id, user);
  }

  @Post()
  @CheckAbility({ action: 'create', subject: 'Contract' })
  async create(@Body() createContractDto: CreateContractDto) {
    return this.contractsService.create(createContractDto);
  }

  @Patch(':id')
  @CheckAbility({ action: 'update', subject: 'Contract' })
  async update(@Param('id') id: string, @Body() updateContractDto: UpdateContractDto) {
    return this.contractsService.update(id, updateContractDto);
  }

  @Delete(':id')
  @CheckAbility({ action: 'delete', subject: 'Contract' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return this.contractsService.remove(id);
  }
}
