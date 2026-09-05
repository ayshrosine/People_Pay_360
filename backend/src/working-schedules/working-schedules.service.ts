import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkingScheduleDto } from './dto/create-working-schedule.dto';
import { UpdateWorkingScheduleDto } from './dto/update-working-schedule.dto';

@Injectable()
export class WorkingSchedulesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.workingSchedule.findMany({
      include: {
        lines: {
          orderBy: { dayOfWeek: 'asc' },
        },
        _count: {
          select: { employees: true, contracts: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const schedule = await this.prisma.workingSchedule.findUnique({
      where: { id },
      include: {
        lines: {
          orderBy: { dayOfWeek: 'asc' },
        },
        employees: true,
        contracts: true,
      },
    });

    if (!schedule) {
      throw new NotFoundException('Working schedule not found');
    }

    return schedule;
  }

  async create(createWorkingScheduleDto: CreateWorkingScheduleDto) {
    // Calculate total weekly hours
    const totalWeeklyHours = this.calculateTotalWeeklyHours(createWorkingScheduleDto.lines);

    return this.prisma.workingSchedule.create({
      data: {
        name: createWorkingScheduleDto.name,
        company: createWorkingScheduleDto.company || 'My Company',
        timezone: createWorkingScheduleDto.timezone || 'Asia/Kolkata',
        scheduleType: createWorkingScheduleDto.scheduleType || 'Fixed',
        totalWeeklyHours,
        status: createWorkingScheduleDto.status || 'Active',
        lines: {
          create: createWorkingScheduleDto.lines,
        },
      },
      include: {
        lines: {
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });
  }

  async update(id: string, updateWorkingScheduleDto: UpdateWorkingScheduleDto) {
    const schedule = await this.prisma.workingSchedule.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!schedule) {
      throw new NotFoundException('Working schedule not found');
    }

    // Calculate total weekly hours if lines are provided
    let totalWeeklyHours = schedule.totalWeeklyHours;
    if (updateWorkingScheduleDto.lines) {
      totalWeeklyHours = this.calculateTotalWeeklyHours(updateWorkingScheduleDto.lines);
    }

    // If lines are being updated, we need to delete existing lines and create new ones
    if (updateWorkingScheduleDto.lines) {
      await this.prisma.workingScheduleLine.deleteMany({
        where: { scheduleId: id },
      });
    }

    return this.prisma.workingSchedule.update({
      where: { id },
      data: {
        ...updateWorkingScheduleDto,
        totalWeeklyHours,
        lines: updateWorkingScheduleDto.lines
          ? {
              create: updateWorkingScheduleDto.lines,
            }
          : undefined,
      },
      include: {
        lines: {
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });
  }

  async remove(id: string) {
    const schedule = await this.prisma.workingSchedule.findUnique({
      where: { id },
    });

    if (!schedule) {
      throw new NotFoundException('Working schedule not found');
    }

    return this.prisma.workingSchedule.delete({
      where: { id },
    });
  }

  private calculateTotalWeeklyHours(lines: Array<{ dayOfWeek: number; startTime: string; endTime: string; breakMinutes?: number }>): number {
    let totalHours = 0;

    for (const line of lines) {
      const start = this.timeToMinutes(line.startTime);
      const end = this.timeToMinutes(line.endTime);
      const breakMinutes = line.breakMinutes || 0;
      
      const workMinutes = end - start - breakMinutes;
      totalHours += workMinutes / 60; // Convert to hours
    }

    return totalHours;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
}
