import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckAbility } from '../common/decorators/check-ability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/abilities/ability.factory';
import {
  assertOwnsEmployeeRecord,
  isSelfServiceOnly,
  resolveEmployeeScope,
} from '../common/guards/scope.util';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('widget/today')
  async getTodayWidget(@CurrentUser() user: RequestUser) {
    return this.attendanceService.getTodayWidget(user.employeeId ?? undefined);
  }

  @Get()
  @CheckAbility({ action: 'read', subject: 'Attendance' })
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query('employeeId') employeeId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
  ) {
    return this.attendanceService.findAll({
      // Self-service users only ever see their own attendance.
      employeeId: resolveEmployeeScope(user, employeeId),
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      status,
    });
  }

  @Get(':id')
  @CheckAbility({ action: 'read', subject: 'Attendance' })
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const attendance = await this.attendanceService.findOne(id);
    assertOwnsEmployeeRecord(user, attendance.employeeId);
    return attendance;
  }

  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  async checkIn(@Body() checkInDto: CheckInDto, @CurrentUser() user: RequestUser) {
    // Employees may only check themselves in; HR may check anyone in.
    const employeeId = isSelfServiceOnly(user)
      ? resolveEmployeeScope(user, undefined)!
      : (checkInDto.employeeId ?? user.employeeId);

    if (!employeeId) {
      throw new BadRequestException({
        message: 'No employee record is linked to this account.',
        code: 'NO_LINKED_EMPLOYEE',
      });
    }

    return this.attendanceService.checkIn(employeeId);
  }

  @Post(':id/check-out')
  @HttpCode(HttpStatus.OK)
  async checkOut(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const attendance = await this.attendanceService.findOne(id);
    assertOwnsEmployeeRecord(user, attendance.employeeId);
    return this.attendanceService.checkOut(id);
  }

  @Patch(':id')
  @CheckAbility({ action: 'update', subject: 'Attendance' })
  async update(@Param('id') id: string, @Body() updateAttendanceDto: UpdateAttendanceDto, @CurrentUser() user: RequestUser) {
    return this.attendanceService.update(id, updateAttendanceDto, user.id);
  }
}
