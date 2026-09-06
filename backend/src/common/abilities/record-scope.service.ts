import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from './ability.factory';
import { DepartmentHeadService } from './department-head.service';

/**
 * The second authorisation question.
 *
 * CASL answers "may this role read contracts at all". It cannot answer "may
 * they read *this* contract" — and those have different answers. Left unasked,
 * an employee who is perfectly entitled to read their own contract also reads
 * every colleague's wage.
 *
 * This service answers the second question once, so every module that returns
 * per-employee records scopes it the same way instead of each inventing its own
 * (or, as happened here, forgetting entirely).
 */

/** Roles that legitimately see the whole company. */
const UNRESTRICTED_ROLES = ['ADMIN', 'HR_MANAGER', 'HR_PAYROLL_USER', 'HR_PAYROLL_MANAGER'];

/** An id that matches nothing, for a user with no employee record. */
const MATCHES_NOTHING = '__no_employee__';

@Injectable()
export class RecordScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departmentHeads: DepartmentHeadService,
  ) {}

  isUnrestricted(user: RequestUser | undefined | null): boolean {
    return Boolean(user && UNRESTRICTED_ROLES.includes(user.role));
  }

  /**
   * Every employee id this caller may see, or `null` for "no restriction".
   *
   * Three tiers: HR sees everyone, a department head sees their department
   * plus themselves, everyone else sees only themselves.
   */
  async visibleEmployeeIds(user: RequestUser | undefined | null): Promise<string[] | null> {
    if (this.isUnrestricted(user)) return null;

    const own = user?.employeeId ?? MATCHES_NOTHING;
    const departmentIds = await this.departmentHeads.departmentsHeadedBy(user);

    if (departmentIds.length === 0) return [own];

    const members = await this.prisma.employee.findMany({
      where: { departmentId: { in: departmentIds } },
      select: { id: true },
    });

    return [...new Set([own, ...members.map((m) => m.id)])];
  }

  /**
   * A Prisma filter for a model with an `employeeId` column, or `null` when the
   * caller may see everything.
   *
   * `requestedEmployeeId` is the filter the caller asked for. It is honoured
   * only where it stays inside what they are allowed to see — a self-service
   * user asking for someone else's records gets their own, not a 500.
   */
  async employeeFilter(
    user: RequestUser | undefined | null,
    requestedEmployeeId?: string,
  ): Promise<{ employeeId: string | { in: string[] } } | null> {
    const visible = await this.visibleEmployeeIds(user);

    if (visible === null) {
      return requestedEmployeeId ? { employeeId: requestedEmployeeId } : null;
    }

    if (requestedEmployeeId) {
      return {
        employeeId: visible.includes(requestedEmployeeId) ? requestedEmployeeId : MATCHES_NOTHING,
      };
    }

    return { employeeId: { in: visible } };
  }

  /** Throws unless the caller may see records belonging to `employeeId`. */
  async assertCanSee(
    user: RequestUser | undefined | null,
    employeeId: string | null | undefined,
  ): Promise<void> {
    const visible = await this.visibleEmployeeIds(user);
    if (visible === null) return;
    if (employeeId && visible.includes(employeeId)) return;

    throw new ForbiddenException({
      message: 'You can only access records for yourself or your own department.',
      code: 'OUT_OF_SCOPE',
    });
  }
}
