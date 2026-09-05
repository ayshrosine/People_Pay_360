import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { TimeOffRequestStatus } from '@prisma/client';

@Injectable()
export class TimeOffRequestsService {
  constructor(private prisma: PrismaService) {}

  async findAll(employeeId?: string, status?: string) {
    const where: any = {};
    
    if (employeeId) {
      where.employeeId = employeeId;
    }
    
    if (status) {
      where.status = status;
    }

    return this.prisma.timeOffRequest.findMany({
      where,
      include: {
        employee: true,
        timeOffType: true,
      },
      orderBy: { createdAt: 'desc' },
    });
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
    // Check if the time off type requires allocation
    const timeOffType = await this.prisma.timeOffType.findUnique({
      where: { id: createTimeOffRequestDto.timeOffTypeId },
    });

    if (!timeOffType) {
      throw new NotFoundException('Time off type not found');
    }

    // If allocation is required, check if the employee has sufficient balance
    if (timeOffType.requiresAllocation) {
      const allocation = await this.prisma.timeOffAllocation.findFirst({
        where: {
          employeeId: createTimeOffRequestDto.employeeId,
          timeOffTypeId: createTimeOffRequestDto.timeOffTypeId,
          status: 'Approved',
          validFrom: { lte: new Date() },
          OR: [
            { validTo: null },
            { validTo: { gte: new Date() } },
          ],
        },
      });

      if (!allocation) {
        throw new BadRequestException('No approved allocation found for this time off type');
      }

      if (Number(allocation.remaining) < createTimeOffRequestDto.duration) {
        throw new BadRequestException(
          `Insufficient balance. Available: ${allocation.remaining}, Requested: ${createTimeOffRequestDto.duration}`,
        );
      }
    }

    return this.prisma.timeOffRequest.create({
      data: {
        employeeId: createTimeOffRequestDto.employeeId || '',
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

  async approve(id: string, approvedById: string) {
    const request = await this.prisma.timeOffRequest.findUnique({
      where: { id },
      include: {
        timeOffType: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Time off request not found');
    }

    if (request.status !== TimeOffRequestStatus.TO_APPROVE) {
      throw new BadRequestException('Request is not in a state that can be approved');
    }

    // Update the request status
    const updatedRequest = await this.prisma.timeOffRequest.update({
      where: { id },
      data: {
        status: TimeOffRequestStatus.APPROVED,
        approvedById,
        approvedAt: new Date(),
      },
      include: {
        employee: true,
        timeOffType: true,
      },
    });

    // If the time off type requires allocation, update the allocation balance
    if (request.timeOffType.requiresAllocation) {
      const allocation = await this.prisma.timeOffAllocation.findFirst({
        where: {
          employeeId: request.employeeId,
          timeOffTypeId: request.timeOffTypeId,
          status: 'Approved',
          validFrom: { lte: new Date() },
          OR: [
            { validTo: null },
            { validTo: { gte: new Date() } },
          ],
        },
      });

      if (allocation) {
        await this.prisma.timeOffAllocation.update({
          where: { id: allocation.id },
          data: {
            taken: Number(allocation.taken) + request.duration,
            remaining: Number(allocation.remaining) - request.duration,
          },
        });
      }
    }

    return updatedRequest;
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
