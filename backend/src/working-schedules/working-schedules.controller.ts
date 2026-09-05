import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { WorkingSchedulesService } from './working-schedules.service';
import { CreateWorkingScheduleDto } from './dto/create-working-schedule.dto';
import { UpdateWorkingScheduleDto } from './dto/update-working-schedule.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../common/decorators/check-ability.decorator';

@Controller('working-schedules')
@UseGuards(JwtAuthGuard)
export class WorkingSchedulesController {
  constructor(private readonly workingSchedulesService: WorkingSchedulesService) {}

  @Get()
  @CheckAbility({ action: 'read', subject: 'WorkingSchedule' })
  async findAll() {
    return this.workingSchedulesService.findAll();
  }

  @Get(':id')
  @CheckAbility({ action: 'read', subject: 'WorkingSchedule' })
  async findOne(@Param('id') id: string) {
    return this.workingSchedulesService.findOne(id);
  }

  @Post()
  @CheckAbility({ action: 'create', subject: 'WorkingSchedule' })
  async create(@Body() createWorkingScheduleDto: CreateWorkingScheduleDto) {
    return this.workingSchedulesService.create(createWorkingScheduleDto);
  }

  @Patch(':id')
  @CheckAbility({ action: 'update', subject: 'WorkingSchedule' })
  async update(@Param('id') id: string, @Body() updateWorkingScheduleDto: UpdateWorkingScheduleDto) {
    return this.workingSchedulesService.update(id, updateWorkingScheduleDto);
  }

  @Delete(':id')
  @CheckAbility({ action: 'delete', subject: 'WorkingSchedule' })
  async remove(@Param('id') id: string) {
    return this.workingSchedulesService.remove(id);
  }
}
