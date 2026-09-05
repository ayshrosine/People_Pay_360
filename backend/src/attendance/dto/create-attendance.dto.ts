import { IsUUID, IsDateString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';

export class CreateAttendanceDto {
  @ApiProperty({ example: 'uuid-of-employee' })
  @IsUUID()
  employeeId: string;

  @ApiProperty({ example: '2024-01-01T09:00:00Z' })
  @IsDateString()
  checkIn: string;

  @ApiProperty({ example: '2024-01-01T18:00:00Z', required: false })
  @IsOptional()
  @IsDateString()
  checkOut?: string;

  @ApiProperty({ enum: AttendanceStatus, required: false })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiProperty({ example: 'Running late due to traffic', required: false })
  @IsOptional()
  notes?: string;
}
