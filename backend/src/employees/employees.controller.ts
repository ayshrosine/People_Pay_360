import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../common/decorators/check-ability.decorator';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @CheckAbility({ action: 'read', subject: 'Employee' })
  async findAll(
    @Query('view') view?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
  ) {
    return this.employeesService.findAll({
      view,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      sort,
    });
  }

  @Get(':id')
  @CheckAbility({ action: 'read', subject: 'Employee' })
  async findOne(@Param('id') id: string) {
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
  async getContracts(@Param('id') id: string) {
    return this.employeesService.getContracts(id);
  }

  @Get(':id/attendance')
  @CheckAbility({ action: 'read', subject: 'Attendance' })
  async getAttendance(@Param('id') id: string) {
    return this.employeesService.getAttendance(id);
  }

  @Get(':id/time-off')
  @CheckAbility({ action: 'read', subject: 'TimeOffRequest' })
  async getTimeOff(@Param('id') id: string) {
    return this.employeesService.getTimeOff(id);
  }

  @Get(':id/timeline')
  @CheckAbility({ action: 'read', subject: 'Employee' })
  async getTimeline(@Param('id') id: string) {
    return this.employeesService.getTimeline(id);
  }
}
