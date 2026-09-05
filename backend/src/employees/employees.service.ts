import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeStatus, Prisma } from '@prisma/client';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    view?: string;
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
    departmentId?: string;
    status?: EmployeeStatus;
    /** Set by the controller for self-service users; narrows to one record. */
    scopeToEmployeeId?: string;
  }) {
    const { view, search, sort, departmentId, status, scopeToEmployeeId } = params;
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 50;
    const skip = (page - 1) * limit;
    const take = limit;

    const where: Prisma.EmployeeWhereInput = {
      ...(scopeToEmployeeId ? { id: scopeToEmployeeId } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { workEmail: { contains: search, mode: 'insensitive' as const } },
              { jobPosition: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const employees = await this.prisma.employee.findMany({
      where,
      skip,
      take,
      include: {
        department: true,
        manager: true,
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
      // The kanban board groups by department when one is not already filtered,
      // otherwise by status - matching the view switcher in the UI.
      const groupBy = params.departmentId ? 'status' : 'department';

      const grouped = employees.reduce(
        (acc, employee) => {
          const key =
            groupBy === 'status'
              ? employee.status
              : (employee.department?.name ?? 'Unassigned');
          (acc[key] ??= []).push(employee);
          return acc;
        },
        {} as Record<string, typeof employees>,
      );

      return {
        data: employees,
        meta: {
          total,
          page,
          limit,
          groups: Object.entries(grouped).map(([key, items]) => ({
            key,
            count: items.length,
            employeeIds: items.map((e) => e.id),
          })),
        },
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
      throw new NotFoundException({ message: 'Employee not found', code: 'NOT_FOUND' });
    }

    return employee;
  }

  async create(createEmployeeDto: CreateEmployeeDto) {
    // Check if email already exists
    const existingEmployee = await this.prisma.employee.findUnique({
      where: { workEmail: createEmployeeDto.workEmail },
    });

    if (existingEmployee) {
      throw new ConflictException({
        message: 'An employee with this work email already exists.',
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    return this.prisma.employee.create({
      data: createEmployeeDto,
      include: {
        department: true,
        manager: true,
      },
    });
  }

  async update(id: string, updateEmployeeDto: UpdateEmployeeDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
    });

    if (!employee) {
      throw new NotFoundException({ message: 'Employee not found', code: 'NOT_FOUND' });
    }

    // Check if email is being changed and if it already exists
    if (updateEmployeeDto.workEmail && updateEmployeeDto.workEmail !== employee.workEmail) {
      const existingEmployee = await this.prisma.employee.findUnique({
        where: { workEmail: updateEmployeeDto.workEmail },
      });

      if (existingEmployee) {
        throw new ConflictException({
        message: 'An employee with this work email already exists.',
        code: 'EMAIL_ALREADY_EXISTS',
      });
      }
    }

    return this.prisma.employee.update({
      where: { id },
      data: updateEmployeeDto,
      include: {
        department: true,
        manager: true,
      },
    });
  }

  /**
   * Deletes an employee only while they have no history worth keeping.
   *
   * Payroll records are legal documents and attendance is an audit trail, so an
   * employee who has either must be archived rather than erased - otherwise a
   * paid payslip would lose the person it belongs to. Attempting it previously
   * surfaced a raw Prisma foreign-key error as a 500; the caller deserves to be
   * told what is holding the record and what to do instead.
   */
  async remove(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
    });

    if (!employee) {
      throw new NotFoundException({ message: 'Employee not found', code: 'NOT_FOUND' });
    }

    const [payslips, attendance, contracts, allocations, requests] = await Promise.all([
      this.prisma.payslip.count({ where: { employeeId: id } }),
      this.prisma.attendance.count({ where: { employeeId: id } }),
      this.prisma.contract.count({ where: { employeeId: id } }),
      this.prisma.timeOffAllocation.count({ where: { employeeId: id } }),
      this.prisma.timeOffRequest.count({ where: { employeeId: id } }),
    ]);

    const blockers = [
      payslips && `${payslips} payslip(s)`,
      contracts && `${contracts} contract(s)`,
      attendance && `${attendance} attendance record(s)`,
      allocations && `${allocations} time-off allocation(s)`,
      requests && `${requests} time-off request(s)`,
    ].filter(Boolean) as string[];

    if (blockers.length > 0) {
      throw new ConflictException({
        message:
          `${employee.name} still has ${blockers.join(', ')} and cannot be deleted. ` +
          'Set their status to TERMINATED to archive them instead - payroll history must be preserved.',
        code: 'EMPLOYEE_HAS_RECORDS',
        details: { payslips, contracts, attendance, allocations, requests },
      });
    }

    // Managers are optional, so detaching reports is safe and keeps the delete
    // from failing on a self-referential foreign key.
    await this.prisma.employee.updateMany({
      where: { managerId: id },
      data: { managerId: null },
    });

    return this.prisma.employee.delete({
      where: { id },
    });
  }

  async getContracts(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
    });

    if (!employee) {
      throw new NotFoundException({ message: 'Employee not found', code: 'NOT_FOUND' });
    }

    return this.prisma.contract.findMany({
      where: { employeeId: id },
      include: {
        salaryStructure: true,
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async getAttendance(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
    });

    if (!employee) {
      throw new NotFoundException({ message: 'Employee not found', code: 'NOT_FOUND' });
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
      throw new NotFoundException({ message: 'Employee not found', code: 'NOT_FOUND' });
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
      throw new NotFoundException({ message: 'Employee not found', code: 'NOT_FOUND' });
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
