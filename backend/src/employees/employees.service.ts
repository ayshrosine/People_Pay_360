import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    view?: string;
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
  }) {
    const { view, page, limit, search, sort } = params;
    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { workEmail: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const employees = await this.prisma.employee.findMany({
      where,
      skip,
      take,
      include: {
        department: true,
        manager: true,
        workingSchedule: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: sort ? { [sort.split(':')[0]]: sort.split(':')[1] } : { createdAt: 'desc' },
    });

    const total = await this.prisma.employee.count({ where });

    if (view === 'kanban') {
      // Group by status for kanban view
      const grouped = employees.reduce((acc, emp) => {
        const status = emp.status;
        if (!acc[status]) acc[status] = [];
        acc[status].push(emp);
        return acc;
      }, {} as Record<string, typeof employees>);

      return {
        data: grouped,
        meta: { total, page, limit },
      };
    }

    return {
      data: employees,
      meta: { total, page, limit },
    };
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        manager: true,
        workingSchedule: true,
        reports: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  async create(createEmployeeDto: CreateEmployeeDto) {
    // Check if email already exists
    const existingEmployee = await this.prisma.employee.findUnique({
      where: { workEmail: createEmployeeDto.workEmail },
    });

    if (existingEmployee) {
      throw new ConflictException('Employee with this email already exists');
    }

    return this.prisma.employee.create({
      data: createEmployeeDto,
      include: {
        department: true,
        manager: true,
        workingSchedule: true,
      },
    });
  }

  async update(id: string, updateEmployeeDto: UpdateEmployeeDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    // Check if email is being changed and if it already exists
    if (updateEmployeeDto.workEmail && updateEmployeeDto.workEmail !== employee.workEmail) {
      const existingEmployee = await this.prisma.employee.findUnique({
        where: { workEmail: updateEmployeeDto.workEmail },
      });

      if (existingEmployee) {
        throw new ConflictException('Employee with this email already exists');
      }
    }

    return this.prisma.employee.update({
      where: { id },
      data: updateEmployeeDto,
      include: {
        department: true,
        manager: true,
        workingSchedule: true,
      },
    });
  }

  async remove(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.prisma.employee.delete({
      where: { id },
    });
  }

  async getContracts(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.prisma.contract.findMany({
      where: { employeeId: id },
      include: {
        salaryStructure: true,
        workingSchedule: true,
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async getAttendance(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.prisma.attendance.findMany({
      where: { employeeId: id },
      orderBy: { checkIn: 'desc' },
    });
  }

  async getTimeOff(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.prisma.timeOffRequest.findMany({
      where: { employeeId: id },
      include: {
        timeOffType: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTimeline(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    // Get contracts, time off requests, and schedule changes
    const contracts = await this.prisma.contract.findMany({
      where: { employeeId: id },
      orderBy: { startDate: 'desc' },
    });

    const timeOffRequests = await this.prisma.timeOffRequest.findMany({
      where: { employeeId: id },
      include: { timeOffType: true },
      orderBy: { createdAt: 'desc' },
    });

    const attendances = await this.prisma.attendance.findMany({
      where: { employeeId: id },
      orderBy: { checkIn: 'desc' },
      take: 50, // Limit to recent attendance
    });

    // Combine and sort by date
    const timeline = [
      ...contracts.map(c => ({
        type: 'contract',
        date: c.startDate,
        data: c,
      })),
      ...timeOffRequests.map(r => ({
        type: 'time_off',
        date: r.startDate,
        data: r,
      })),
      ...attendances.map(a => ({
        type: 'attendance',
        date: a.checkIn,
        data: a,
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    return timeline;
  }
}
