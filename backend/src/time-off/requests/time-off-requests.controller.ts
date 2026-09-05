import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { TimeOffRequestsService } from './time-off-requests.service';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CheckAbility } from '../../common/decorators/check-ability.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('time-off/requests')
@UseGuards(JwtAuthGuard)
export class TimeOffRequestsController {
  constructor(private readonly timeOffRequestsService: TimeOffRequestsService) {}

  @Get()
  @CheckAbility({ action: 'read', subject: 'TimeOffRequest' })
  async findAll(
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
  ) {
    return this.timeOffRequestsService.findAll(employeeId, status);
  }

  @Get(':id')
  @CheckAbility({ action: 'read', subject: 'TimeOffRequest' })
  async findOne(@Param('id') id: string) {
    return this.timeOffRequestsService.findOne(id);
  }

  @Post()
  @CheckAbility({ action: 'create', subject: 'TimeOffRequest' })
  async create(@Body() createTimeOffRequestDto: CreateTimeOffRequestDto, @CurrentUser() user: any) {
    // If employeeId is not provided, use the current user's employeeId
    const employeeId = createTimeOffRequestDto.employeeId || user.employeeId;
    return this.timeOffRequestsService.create({ ...createTimeOffRequestDto, employeeId });
  }

  @Patch(':id/approve')
  @CheckAbility({ action: 'update', subject: 'TimeOffRequest' })
  @HttpCode(HttpStatus.OK)
  async approve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.timeOffRequestsService.approve(id, user.id);
  }

  @Patch(':id/refuse')
  @CheckAbility({ action: 'update', subject: 'TimeOffRequest' })
  @HttpCode(HttpStatus.OK)
  async refuse(@Param('id') id: string, @CurrentUser() user: any) {
    return this.timeOffRequestsService.refuse(id, user.id);
  }
}
