import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSalaryStructureDto } from './dto/create-salary-structure.dto';
import { UpdateSalaryStructureDto } from './dto/update-salary-structure.dto';

@Injectable()
export class SalaryStructuresService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.salaryStructure.findMany({
      include: {
        rules: {
          orderBy: { sequence: 'asc' },
        },
        _count: {
          select: { contracts: true, payruns: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const structure = await this.prisma.salaryStructure.findUnique({
      where: { id },
      include: {
        rules: {
          orderBy: { sequence: 'asc' },
        },
        contracts: true,
        payruns: true,
      },
    });

    if (!structure) {
      throw new NotFoundException('Salary structure not found');
    }

    return structure;
  }

  async create(createSalaryStructureDto: CreateSalaryStructureDto) {
    return this.prisma.salaryStructure.create({
      data: {
        name: createSalaryStructureDto.name,
        description: createSalaryStructureDto.description,
        isActive: createSalaryStructureDto.isActive !== undefined ? createSalaryStructureDto.isActive : true,
      },
      include: {
        rules: {
          orderBy: { sequence: 'asc' },
        },
      },
    });
  }

  async update(id: string, updateSalaryStructureDto: UpdateSalaryStructureDto) {
    const structure = await this.prisma.salaryStructure.findUnique({
      where: { id },
    });

    if (!structure) {
      throw new NotFoundException('Salary structure not found');
    }

    return this.prisma.salaryStructure.update({
      where: { id },
      data: updateSalaryStructureDto,
      include: {
        rules: {
          orderBy: { sequence: 'asc' },
        },
      },
    });
  }

  async remove(id: string) {
    const structure = await this.prisma.salaryStructure.findUnique({
      where: { id },
    });

    if (!structure) {
      throw new NotFoundException('Salary structure not found');
    }

    return this.prisma.salaryStructure.delete({
      where: { id },
    });
  }
}
