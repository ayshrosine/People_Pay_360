import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTimeOffAllocationDto } from './dto/create-time-off-allocation.dto';

@Injectable()
export class TimeOffAllocationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(employeeId?: string) {
    const where = employeeId ? { employeeId } : {};
    return this.prisma.timeOffAllocation.findMany({
      where,
      include: {
        employee: true,
        timeOffType: true,
      },
      orderBy: { validFrom: 'desc' },
    });
  }

  async findOne(id: string) {
    const allocation = await this.prisma.timeOffAllocation.findUnique({
      where: { id },
      include: {
        employee: true,
        timeOffType: true,
      },
    });

    if (!allocation) {
      throw new NotFoundException('Time off allocation not found');
    }

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
