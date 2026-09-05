import { IsString, IsOptional, IsArray, IsNumber, ValidateNested, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class WorkingScheduleLineDto {
  @ApiProperty({ example: 0 })
  @IsInt()
  dayOfWeek: number;

  @ApiProperty({ example: '09:00' })
  @IsString()
  startTime: string;

  @ApiProperty({ example: '18:00' })
  @IsString()
  endTime: string;

  @ApiProperty({ example: 60, required: false })
  @IsOptional()
  @IsInt()
  breakMinutes?: number;
}

export class CreateWorkingScheduleDto {
  @ApiProperty({ example: 'Standard 9-5' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'My Company', required: false })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiProperty({ example: 'Asia/Kolkata', required: false })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ example: 'Fixed', required: false })
  @IsOptional()
  @IsString()
  scheduleType?: string;

  @ApiProperty({ type: [WorkingScheduleLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingScheduleLineDto)
  lines: WorkingScheduleLineDto[];

  @ApiProperty({ example: 'Active', required: false })
  @IsOptional()
  @IsString()
  status?: string;
}
