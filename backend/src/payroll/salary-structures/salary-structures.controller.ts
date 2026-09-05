import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { SalaryStructuresService } from './salary-structures.service';
import { CreateSalaryStructureDto } from './dto/create-salary-structure.dto';
import { UpdateSalaryStructureDto } from './dto/update-salary-structure.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CheckAbility } from '../../common/decorators/check-ability.decorator';

@Controller('payroll/structures')
@UseGuards(JwtAuthGuard)
export class SalaryStructuresController {
  constructor(private readonly salaryStructuresService: SalaryStructuresService) {}

  @Get()
  @CheckAbility({ action: 'read', subject: 'SalaryStructure' })
  async findAll() {
    return this.salaryStructuresService.findAll();
  }

  @Get(':id')
  @CheckAbility({ action: 'read', subject: 'SalaryStructure' })
  async findOne(@Param('id') id: string) {
    return this.salaryStructuresService.findOne(id);
  }

  @Post()
  @CheckAbility({ action: 'create', subject: 'SalaryStructure' })
  async create(@Body() createSalaryStructureDto: CreateSalaryStructureDto) {
    return this.salaryStructuresService.create(createSalaryStructureDto);
  }

  @Patch(':id')
  @CheckAbility({ action: 'update', subject: 'SalaryStructure' })
  async update(@Param('id') id: string, @Body() updateSalaryStructureDto: UpdateSalaryStructureDto) {
    return this.salaryStructuresService.update(id, updateSalaryStructureDto);
  }

  @Delete(':id')
  @CheckAbility({ action: 'delete', subject: 'SalaryStructure' })
  async remove(@Param('id') id: string) {
    return this.salaryStructuresService.remove(id);
  }
}
