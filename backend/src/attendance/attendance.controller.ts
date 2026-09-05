import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { CheckInDto } from './dto/check-in.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../common/decorators/check-ability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('widget/today')
  async getTodayWidget(@CurrentUser() user: any) {
    return this.attendanceService.getTodayWidget(user.employeeId);
  }

  @Get()
  @CheckAbility({ action: 'read', subject: 'Attendance' })
  async findAll(
    @Query('employeeId') employeeId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
  ) {
    return this.attendanceService.findAll({
      employeeId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      status,
    });
  }

  @Get(':id')
  @CheckAbility({ action: 'read', subject: 'Attendance' })
  async findOne(@Param('id') id: string) {
    return this.attendanceService.findOne(id);
  }

  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  async checkIn(@Body() checkInDto: CheckInDto, @CurrentUser() user: any) {
    // If employeeId is not provided, use the current user's employeeId
    const employeeId = checkInDto.employeeId || user.employeeId;
    return this.attendanceService.checkIn(employeeId);
  }

  @Post(':id/check-out')
  @HttpCode(HttpStatus.OK)
  async checkOut(@Param('id') id: string) {
    return this.attendanceService.checkOut(id);
  }

  @Patch(':id')
  @CheckAbility({ action: 'update', subject: 'Attendance' })
  async update(@Param('id') id: string, @Body() updateAttendanceDto: UpdateAttendanceDto, @CurrentUser() user: any) {
    return this.attendanceService.update(id, updateAttendanceDto, user.id);
  }
}
