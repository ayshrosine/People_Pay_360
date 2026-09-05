import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { TimeOffTypesService } from './time-off-types.service';
import { CreateTimeOffTypeDto } from './dto/create-time-off-type.dto';
import { UpdateTimeOffTypeDto } from './dto/update-time-off-type.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CheckAbility } from '../../common/decorators/check-ability.decorator';

@Controller('time-off/types')
@UseGuards(JwtAuthGuard)
export class TimeOffTypesController {
  constructor(private readonly timeOffTypesService: TimeOffTypesService) {}

  @Get()
  @CheckAbility({ action: 'read', subject: 'TimeOffType' })
  async findAll() {
    return this.timeOffTypesService.findAll();
  }

  @Get(':id')
  @CheckAbility({ action: 'read', subject: 'TimeOffType' })
  async findOne(@Param('id') id: string) {
    return this.timeOffTypesService.findOne(id);
  }

  @Post()
  @CheckAbility({ action: 'create', subject: 'TimeOffType' })
  async create(@Body() createTimeOffTypeDto: CreateTimeOffTypeDto) {
    return this.timeOffTypesService.create(createTimeOffTypeDto);
  }

  @Patch(':id')
  @CheckAbility({ action: 'update', subject: 'TimeOffType' })
  async update(@Param('id') id: string, @Body() updateTimeOffTypeDto: UpdateTimeOffTypeDto) {
    return this.timeOffTypesService.update(id, updateTimeOffTypeDto);
  }

  @Delete(':id')
  @CheckAbility({ action: 'delete', subject: 'TimeOffType' })
  async remove(@Param('id') id: string) {
    return this.timeOffTypesService.remove(id);
  }
}
