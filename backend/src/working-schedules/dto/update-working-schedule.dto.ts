import { IsString, IsOptional, IsArray, IsNumber, ValidateNested, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { WorkingScheduleLineDto } from './create-working-schedule.dto';

export class UpdateWorkingScheduleDto {
  @ApiProperty({ example: 'Standard 9-5', required: false })
  @IsOptional()
  @IsString()
  name?: string;

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

  @ApiProperty({ type: [WorkingScheduleLineDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingScheduleLineDto)
  lines?: WorkingScheduleLineDto[];

  @ApiProperty({ example: 'Active', required: false })
  @IsOptional()
  @IsString()
  status?: string;
}
