import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../common/decorators/check-ability.decorator';

@Controller('departments')
@UseGuards(JwtAuthGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @CheckAbility({ action: 'read', subject: 'Department' })
  async findAll() {
    return this.departmentsService.findAll();
  }

  @Get(':id')
  @CheckAbility({ action: 'read', subject: 'Department' })
  async findOne(@Param('id') id: string) {
    return this.departmentsService.findOne(id);
  }

  @Post()
  @CheckAbility({ action: 'create', subject: 'Department' })
  async create(@Body() createDepartmentDto: CreateDepartmentDto) {
    return this.departmentsService.create(createDepartmentDto);
  }

  @Patch(':id')
  @CheckAbility({ action: 'update', subject: 'Department' })
  async update(@Param('id') id: string, @Body() updateDepartmentDto: UpdateDepartmentDto) {
    return this.departmentsService.update(id, updateDepartmentDto);
  }

  @Delete(':id')
  @CheckAbility({ action: 'delete', subject: 'Department' })
  async remove(@Param('id') id: string) {
    return this.departmentsService.remove(id);
  }
}
