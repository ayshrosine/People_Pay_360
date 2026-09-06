import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTimeOffAllocationDto } from './dto/create-time-off-allocation.dto';
import { RecordScopeService } from '../../common/abilities/record-scope.service';
import { RequestUser } from '../../common/abilities/ability.factory';

@Injectable()
export class TimeOffAllocationsService {
  constructor(
    private prisma: PrismaService,
    private readonly scope: RecordScopeService,
  ) {}

  /**
   * A balance belongs to one person. An employee sees their own; a department
   * head sees their department's, because they decide the leave drawn from it.
   */
  async findAll(employeeId?: string, user?: RequestUser | null) {
    const where = (await this.scope.employeeFilter(user, employeeId)) ?? {};
    return this.prisma.timeOffAllocation.findMany({
      where,
      include: {
        employee: true,
        timeOffType: true,
      },
      orderBy: { validFrom: 'desc' },
    });
  }

  async findOne(id: string, user?: RequestUser | null) {
    const allocation = await this.prisma.timeOffAllocation.findUnique({
      where: { id },
      include: {
        employee: true,
        timeOffType: true,
      },
    });

    if (!allocation) {
      throw new NotFoundException({ message: 'Time off allocation not found', code: 'NOT_FOUND' });
    }

    // Scoping the list but not the record behind it moves the leak to a URL.
    await this.scope.assertCanSee(user, allocation.employeeId);

    return allocation;
  }

  async create(createTimeOffAllocationDto: CreateTimeOffAllocationDto) {
    return this.prisma.timeOffAllocation.create({
      data: {
        employeeId: createTimeOffAllocationDto.employeeId,
        timeOffTypeId: createTimeOffAllocationDto.timeOffTypeId,
        allocated: createTimeOffAllocationDto.allocated,
        taken: 0,
        remaining: createTimeOffAllocationDto.allocated,
        validFrom: new Date(createTimeOffAllocationDto.validFrom),
        validTo: createTimeOffAllocationDto.validTo ? new Date(createTimeOffAllocationDto.validTo) : null,
        status: createTimeOffAllocationDto.status || 'To Approve',
      },
      include: {
        employee: true,
        timeOffType: true,
      },
    });
  }

  async approve(id: string) {
    const allocation = await this.prisma.timeOffAllocation.findUnique({
      where: { id },
    });

    if (!allocation) {
      throw new NotFoundException('Time off allocation not found');
    }

    return this.prisma.timeOffAllocation.update({
      where: { id },
      data: {
        status: 'Approved',
        remaining: Number(allocation.allocated) - Number(allocation.taken),
      },
      include: {
        employee: true,
        timeOffType: true,
      },
    });
  }
}
