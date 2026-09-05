import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTimeOffTypeDto } from './dto/create-time-off-type.dto';
import { UpdateTimeOffTypeDto } from './dto/update-time-off-type.dto';

@Injectable()
export class TimeOffTypesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.timeOffType.findMany({
      include: {
        _count: {
          select: { allocations: true, requests: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const timeOffType = await this.prisma.timeOffType.findUnique({
      where: { id },
      include: {
        allocations: true,
        requests: true,
      },
    });

    if (!timeOffType) {
      throw new NotFoundException('Time off type not found');
    }

    return timeOffType;
  }

  async create(createTimeOffTypeDto: CreateTimeOffTypeDto) {
    return this.prisma.timeOffType.create({
      data: {
        name: createTimeOffTypeDto.name,
        unit: createTimeOffTypeDto.unit || 'DAYS',
        requiresAllocation: createTimeOffTypeDto.requiresAllocation ?? true,
        requiresApproval: createTimeOffTypeDto.requiresApproval ?? true,
        affectsPayroll: createTimeOffTypeDto.affectsPayroll ?? true,
        colorHex: createTimeOffTypeDto.colorHex || '#6366F1',
      },
    });
  }

  async update(id: string, updateTimeOffTypeDto: UpdateTimeOffTypeDto) {
    const timeOffType = await this.prisma.timeOffType.findUnique({
      where: { id },
    });

    if (!timeOffType) {
      throw new NotFoundException('Time off type not found');
    }

    return this.prisma.timeOffType.update({
      where: { id },
      data: updateTimeOffTypeDto,
    });
  }

  async remove(id: string) {
    const timeOffType = await this.prisma.timeOffType.findUnique({
      where: { id },
    });

    if (!timeOffType) {
      throw new NotFoundException('Time off type not found');
    }

    return this.prisma.timeOffType.delete({
      where: { id },
    });
  }
}
