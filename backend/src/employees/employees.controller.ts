import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EmployeeStatus } from '@prisma/client';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CheckAbility } from '../common/decorators/check-ability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/abilities/ability.factory';
import { assertOwnsEmployeeRecord, resolveEmployeeScope } from '../common/guards/scope.util';

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @CheckAbility({ action: 'read', subject: 'Employee' })
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query('view') view?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: EmployeeStatus,
  ) {
    return this.employeesService.findAll({
      view,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      sort,
      departmentId,
      status,
      // A self-service user only ever sees their own record, whatever they ask for.
      scopeToEmployeeId: resolveEmployeeScope(user, undefined),
    });
  }

  @Get(':id')
  @CheckAbility({ action: 'read', subject: 'Employee' })
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    assertOwnsEmployeeRecord(user, id);
    return this.employeesService.findOne(id);
  }

  @Post()
  @CheckAbility({ action: 'create', subject: 'Employee' })
  async create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeesService.create(createEmployeeDto);
  }

  @Patch(':id')
  @CheckAbility({ action: 'update', subject: 'Employee' })
  async update(@Param('id') id: string, @Body() updateEmployeeDto: UpdateEmployeeDto) {
    return this.employeesService.update(id, updateEmployeeDto);
  }

  @Delete(':id')
  @CheckAbility({ action: 'delete', subject: 'Employee' })
  async remove(@Param('id') id: string) {
    return this.employeesService.remove(id);
  }

  @Get(':id/contracts')
  @CheckAbility({ action: 'read', subject: 'Contract' })
  async getContracts(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    assertOwnsEmployeeRecord(user, id);
    return this.employeesService.getContracts(id);
  }

  @Get(':id/attendance')
  @CheckAbility({ action: 'read', subject: 'Attendance' })
  async getAttendance(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    assertOwnsEmployeeRecord(user, id);
    return this.employeesService.getAttendance(id);
  }

  @Get(':id/time-off')
  @CheckAbility({ action: 'read', subject: 'TimeOffRequest' })
  async getTimeOff(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    assertOwnsEmployeeRecord(user, id);
    return this.employeesService.getTimeOff(id);
  }

  @Get(':id/timeline')
  @CheckAbility({ action: 'read', subject: 'Employee' })
  async getTimeline(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    assertOwnsEmployeeRecord(user, id);
    return this.employeesService.getTimeline(id);
  }
}
