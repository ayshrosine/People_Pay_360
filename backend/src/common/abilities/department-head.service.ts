import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from './ability.factory';

/**
 * Authority that comes from a relationship rather than a role.
 *
 * "Head of Engineering" is not something the CASL role grid can express: two
 * people with the identical `EMPLOYEE` role have different powers depending on
 * which department they lead. So the role guard lets these requests through and
 * this service makes the real decision, per record.
 */
@Injectable()
export class DepartmentHeadService {
  constructor(private readonly prisma: PrismaService) {}

  /** Department ids this user is the head of. Empty for almost everyone. */
  async departmentsHeadedBy(user: RequestUser | undefined | null): Promise<string[]> {
    if (!user?.employeeId) return [];

    const departments = await this.prisma.department.findMany({
      where: { headId: user.employeeId },
      select: { id: true },
    });

    return departments.map((department) => department.id);
  }

  async isHeadOfAnyDepartment(user: RequestUser | undefined | null): Promise<boolean> {
    return (await this.departmentsHeadedBy(user)).length > 0;
  }

  /** True when `employeeId` sits in a department this user leads. */
  async leads(user: RequestUser | undefined | null, employeeId: string): Promise<boolean> {
    const departmentIds = await this.departmentsHeadedBy(user);
    if (departmentIds.length === 0) return false;

    // A head does not approve their own leave - that has to go up the chain.
    if (employeeId === user?.employeeId) return false;

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { departmentId: true },
    });

    return Boolean(employee?.departmentId && departmentIds.includes(employee.departmentId));
  }

  /** Throws unless the user leads the employee's department. */
  async assertLeads(user: RequestUser | undefined | null, employeeId: string): Promise<void> {
    if (await this.leads(user, employeeId)) return;

    throw new ForbiddenException({
      message:
        'Only HR or the head of this employee’s department can decide this request.',
      code: 'NOT_DEPARTMENT_HEAD',
    });
  }
}
