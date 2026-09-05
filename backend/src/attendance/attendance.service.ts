import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { AttendanceStatus } from '@prisma/client';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    employeeId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    status?: string;
  }) {
    const { employeeId, dateFrom, dateTo, status } = params;

    const where: any = {};
    
    if (employeeId) {
      where.employeeId = employeeId;
    }
    
    if (dateFrom || dateTo) {
      where.checkIn = {};
      if (dateFrom) where.checkIn.gte = dateFrom;
      if (dateTo) where.checkIn.lte = dateTo;
    }
    
    if (status) {
      where.status = status;
    }

    return this.prisma.attendance.findMany({
      where,
      include: {
        employee: true,
      },
      orderBy: { checkIn: 'desc' },
    });
  }

  async getTodayWidget(employeeId?: string) {
    if (!employeeId) {
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        checkIn: {
          gte: today,
          lt: tomorrow,
        },
        checkOut: null,
      },
      include: {
        employee: true,
      },
    });

    return attendance;
  }

  async findOne(id: string) {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
      include: {
        employee: true,
      },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance not found');
    }

    return attendance;
  }

  async checkIn(employeeId: string) {
    // Check if there's already an open attendance record for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existingAttendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        checkIn: {
          gte: today,
          lt: tomorrow,
        },
        checkOut: null,
      },
    });

    if (existingAttendance) {
      throw new BadRequestException('You already have an open attendance record for today');
    }

    return this.prisma.attendance.create({
      data: {
        employeeId,
        checkIn: new Date(),
        status: AttendanceStatus.PRESENT,
      },
      include: {
        employee: true,
      },
    });
  }

  async checkOut(id: string) {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            workingSchedule: true,
          },
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance not found');
    }

    if (attendance.checkOut) {
      throw new BadRequestException('This attendance record is already checked out');
    }

    const checkOut = new Date();
    const checkIn = new Date(attendance.checkIn);
    const workedHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60); // Convert to hours

    // Determine status based on worked hours and schedule
    let status = attendance.status;
    
    if (attendance.employee.workingSchedule) {
      const schedule = attendance.employee.workingSchedule;
      const expectedHours = schedule.totalWeeklyHours / 5; // Assuming 5-day work week
      
      if (workedHours > expectedHours * 1.2) {
        status = AttendanceStatus.OVERTIME;
      } else if (workedHours < expectedHours * 0.8) {
        status = AttendanceStatus.LATE;
      }
    }

    // Check for missing checkout (more than 16 hours gap)
    if (workedHours > 16) {
      status = AttendanceStatus.MISSING_CHECKOUT;
    }

    return this.prisma.attendance.update({
      where: { id },
      data: {
        checkOut,
        workedHours,
        status,
      },
      include: {
        employee: true,
      },
    });
  }

  async update(id: string, updateAttendanceDto: UpdateAttendanceDto, editedById: string) {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance not found');
    }

    // Recalculate worked hours if checkOut is being updated
    let workedHours = attendance.workedHours;
    if (updateAttendanceDto.checkOut && attendance.checkIn) {
      const checkOut = new Date(updateAttendanceDto.checkOut);
      const checkIn = new Date(attendance.checkIn);
      workedHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
    }

    return this.prisma.attendance.update({
      where: { id },
      data: {
        ...updateAttendanceDto,
        checkOut: updateAttendanceDto.checkOut ? new Date(updateAttendanceDto.checkOut) : attendance.checkOut,
        workedHours,
        isManualEdit: true,
        editedById,
      },
      include: {
        employee: true,
      },
    });
  }
}
