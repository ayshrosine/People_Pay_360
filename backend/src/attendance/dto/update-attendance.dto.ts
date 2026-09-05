import { IsDateString, IsOptional, IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';

export class UpdateAttendanceDto {
  @ApiProperty({ example: '2024-01-01T18:00:00Z', required: false })
  @IsOptional()
  @IsDateString()
  checkOut?: string;

  @ApiProperty({ enum: AttendanceStatus, required: false })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiProperty({ example: 'Manual correction - system error', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
