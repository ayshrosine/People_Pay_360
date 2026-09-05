import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.department.findMany({
      include: {
        // The head is part of a department's identity in the UI - it decides
        // who can approve that department's leave - so it ships with the list.
        head: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
        _count: {
          select: { employees: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        head: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
        employees: true,
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  /**
   * A head must be an active member of the department they lead.
   *
   * The head's authority is "approve leave for people in this department"; an
   * outsider holding it would be approving for a team they are not part of, and
   * an inactive employee would leave the department unable to get anything
   * approved. `departmentId` is null on create because nobody is in a
   * department that does not exist yet.
   */
  private async assertHeadIsValid(headId: string, departmentId: string | null) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: headId },
      select: { id: true, name: true, status: true, departmentId: true },
    });

    if (!employee) {
      throw new BadRequestException({
        message: 'That employee does not exist, so they cannot lead a department.',
        code: 'HEAD_NOT_FOUND',
      });
    }

    if (employee.status !== 'ACTIVE') {
      throw new BadRequestException({
        message: `${employee.name} is not active and cannot lead a department.`,
        code: 'HEAD_NOT_ACTIVE',
      });
    }

    if (departmentId && employee.departmentId !== departmentId) {
      throw new BadRequestException({
        message: `${employee.name} is not in this department, so they cannot lead it.`,
        code: 'HEAD_NOT_IN_DEPARTMENT',
      });
    }
  }

  async create(createDepartmentDto: CreateDepartmentDto) {
    if (createDepartmentDto.headId) {
      await this.assertHeadIsValid(createDepartmentDto.headId, null);
    }

    return this.prisma.department.create({
      data: createDepartmentDto,
    });
  }

  async update(id: string, updateDepartmentDto: UpdateDepartmentDto) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });

    if (!department) {
      throw new NotFoundException({ message: 'Department not found', code: 'NOT_FOUND' });
    }

    if (updateDepartmentDto.headId) {
      await this.assertHeadIsValid(updateDepartmentDto.headId, id);
    }

    return this.prisma.department.update({
      where: { id },
      data: updateDepartmentDto,
      include: {
        head: { select: { id: true, name: true, workEmail: true, avatarUrl: true } },
      },
    });
  }

  async remove(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return this.prisma.department.delete({
      where: { id },
    });
  }
}
