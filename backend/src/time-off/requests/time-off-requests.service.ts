import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { TimeOffRequestStatus, Prisma } from '@prisma/client';
import { DepartmentHeadService } from '../../common/abilities/department-head.service';
import { RequestUser } from '../../common/abilities/ability.factory';

/** Roles that legitimately see every employee's leave. */
const HR_ROLES = ['ADMIN', 'HR_MANAGER', 'HR_PAYROLL_USER', 'HR_PAYROLL_MANAGER'];

@Injectable()
export class TimeOffRequestsService {
  constructor(
    private prisma: PrismaService,
    private readonly departmentHeads: DepartmentHeadService,
  ) {}

  /**
   * Restricts a listing to what the caller may actually see.
   *
   * "May this role read leave requests" and "may this role read *this* leave
   * request" are different questions. HR sees everything; a department head
   * sees their own department plus their own requests; everyone else sees only
   * their own.
   */
  private async scopeFor(
    user: RequestUser | undefined | null,
  ): Promise<Prisma.TimeOffRequestWhereInput | null> {
    if (user && HR_ROLES.includes(user.role)) return null;

    const departmentIds = await this.departmentHeads.departmentsHeadedBy(user);
    // A user with no employee record matches nothing rather than everything.
    const own = user?.employeeId ?? '__no_employee__';

    if (departmentIds.length > 0) {
      return {
        OR: [{ employeeId: own }, { employee: { departmentId: { in: departmentIds } } }],
      };
    }

    return { employeeId: own };
  }

  async findAll(employeeId?: string, status?: string, user?: RequestUser | null) {
    const filters: Prisma.TimeOffRequestWhereInput[] = [];

    if (employeeId) filters.push({ employeeId });
    if (status) filters.push({ status: status as TimeOffRequestStatus });

    const scope = await this.scopeFor(user);
    if (scope) filters.push(scope);

    return this.prisma.timeOffRequest.findMany({
      where: filters.length ? { AND: filters } : {},
      include: {
        employee: { include: { department: true } },
        timeOffType: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Whoever may decide this request. HR always may; the head of the requester's
   * department may for their own people, but never for themselves.
   */
  async assertMayDecide(id: string, user: RequestUser | undefined | null): Promise<void> {
    if (user && HR_ROLES.includes(user.role)) return;

    const request = await this.prisma.timeOffRequest.findUnique({
      where: { id },
      select: { employeeId: true },
    });

    if (!request) {
      throw new NotFoundException({ message: 'Time off request not found', code: 'NOT_FOUND' });
    }

    await this.departmentHeads.assertLeads(user, request.employeeId);
  }

  async findOne(id: string) {
    const request = await this.prisma.timeOffRequest.findUnique({
      where: { id },
      include: {
        employee: true,
        timeOffType: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Time off request not found');
    }

    return request;
  }

  async create(createTimeOffRequestDto: CreateTimeOffRequestDto) {
    // The controller defaults this to the caller's own employee record; if it
    // is still missing the caller is a user with no linked employee, and
    // creating the row would fail on the foreign key with an opaque error.
    const employeeId = createTimeOffRequestDto.employeeId;
    if (!employeeId) {
      throw new BadRequestException({
        message: 'This account is not linked to an employee record, so it cannot request time off.',
        code: 'NO_LINKED_EMPLOYEE',
      });
    }

    // Check if the time off type requires allocation
    const timeOffType = await this.prisma.timeOffType.findUnique({
      where: { id: createTimeOffRequestDto.timeOffTypeId },
    });

    if (!timeOffType) {
      throw new NotFoundException({ message: 'Time off type not found', code: 'NOT_FOUND' });
    }

    // If allocation is required, check if the employee has sufficient balance
    if (timeOffType.requiresAllocation) {
      const allocation = await this.findUsableAllocation(
        employeeId,
        createTimeOffRequestDto.timeOffTypeId,
      );

      if (!allocation) {
        throw new BadRequestException({
          message: 'No approved allocation found for this time off type.',
          code: 'NO_ALLOCATION',
        });
      }

      if (Number(allocation.remaining) < createTimeOffRequestDto.duration) {
        throw new BadRequestException({
          message: `Insufficient balance. Available: ${allocation.remaining}, requested: ${createTimeOffRequestDto.duration}.`,
          code: 'INSUFFICIENT_BALANCE',
        });
      }
    }

    return this.prisma.timeOffRequest.create({
      data: {
        employeeId,
        timeOffTypeId: createTimeOffRequestDto.timeOffTypeId,
        startDate: new Date(createTimeOffRequestDto.startDate),
        endDate: new Date(createTimeOffRequestDto.endDate),
        duration: createTimeOffRequestDto.duration,
        reason: createTimeOffRequestDto.reason,
        status: TimeOffRequestStatus.TO_APPROVE,
      },
      include: {
        employee: true,
        timeOffType: true,
      },
    });
  }

  /**
   * Approving a leave request and debiting the allocation must be one atomic
   * unit: a partial application would leave the employee's remaining balance
   * permanently wrong, and `remaining` is the value every later request is
   * validated against.
   */
  async approve(id: string, approvedById: string) {
    const request = await this.prisma.timeOffRequest.findUnique({
      where: { id },
      include: { timeOffType: true },
    });

    if (!request) {
      throw new NotFoundException({
        message: 'Time off request not found',
        code: 'NOT_FOUND',
      });
    }

    if (request.status !== TimeOffRequestStatus.TO_APPROVE) {
      throw new BadRequestException({
        message: `A request in status ${request.status} cannot be approved.`,
        code: 'INVALID_REQUEST_STATE',
      });
    }

    let allocationId: string | null = null;

    if (request.timeOffType.requiresAllocation) {
      const allocation = await this.findUsableAllocation(
        request.employeeId,
        request.timeOffTypeId,
      );

      if (!allocation) {
        throw new BadRequestException({
          message: 'No approved allocation covers this request.',
          code: 'NO_ALLOCATION',
        });
      }

      // Re-check at approval time: the balance may have been consumed by
      // another request that was approved after this one was submitted.
      if (Number(allocation.remaining) < request.duration) {
        throw new BadRequestException({
          message: `Insufficient balance. Available: ${allocation.remaining}, requested: ${request.duration}.`,
          code: 'INSUFFICIENT_BALANCE',
        });
      }

      allocationId = allocation.id;
    }

    const [updatedRequest] = await this.prisma.$transaction([
      this.prisma.timeOffRequest.update({
        where: { id },
        data: {
          status: TimeOffRequestStatus.APPROVED,
          approvedById,
          approvedAt: new Date(),
        },
        include: { employee: true, timeOffType: true },
      }),
      ...(allocationId
        ? [
            this.prisma.timeOffAllocation.update({
              where: { id: allocationId },
              data: {
                taken: { increment: request.duration },
                remaining: { decrement: request.duration },
              },
            }),
          ]
        : []),
    ]);

    return updatedRequest;
  }

  /** The approved, currently-valid allocation a request draws down from. */
  private findUsableAllocation(employeeId: string, timeOffTypeId: string) {
    const now = new Date();
    return this.prisma.timeOffAllocation.findFirst({
      where: {
        employeeId,
        timeOffTypeId,
        status: 'Approved',
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      orderBy: { validFrom: 'asc' },
    });
  }

  async refuse(id: string, approvedById: string) {
    const request = await this.prisma.timeOffRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Time off request not found');
    }

    if (request.status !== TimeOffRequestStatus.TO_APPROVE) {
      throw new BadRequestException('Request is not in a state that can be refused');
    }

    return this.prisma.timeOffRequest.update({
      where: { id },
      data: {
        status: TimeOffRequestStatus.REFUSED,
        approvedById,
        approvedAt: new Date(),
      },
      include: {
        employee: true,
        timeOffType: true,
      },
    });
  }
}
