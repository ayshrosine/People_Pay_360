import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { TimeOffAllocationsService } from './time-off-allocations.service';
import { CreateTimeOffAllocationDto } from './dto/create-time-off-allocation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CheckAbility } from '../../common/decorators/check-ability.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/abilities/ability.factory';

@Controller('time-off/allocations')
@UseGuards(JwtAuthGuard)
export class TimeOffAllocationsController {
  constructor(private readonly timeOffAllocationsService: TimeOffAllocationsService) {}

  @Get()
  @CheckAbility({ action: 'read', subject: 'TimeOffAllocation' })
  async findAll(@CurrentUser() user: RequestUser, @Query('employeeId') employeeId?: string) {
    return this.timeOffAllocationsService.findAll(employeeId, user);
  }

  @Get(':id')
  @CheckAbility({ action: 'read', subject: 'TimeOffAllocation' })
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.timeOffAllocationsService.findOne(id, user);
  }

  @Post()
  @CheckAbility({ action: 'create', subject: 'TimeOffAllocation' })
  async create(@Body() createTimeOffAllocationDto: CreateTimeOffAllocationDto) {
    return this.timeOffAllocationsService.create(createTimeOffAllocationDto);
  }

  @Patch(':id/approve')
  @CheckAbility({ action: 'update', subject: 'TimeOffAllocation' })
  @HttpCode(HttpStatus.OK)
  async approve(@Param('id') id: string) {
    return this.timeOffAllocationsService.approve(id);
  }
}
