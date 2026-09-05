import { IsUUID, IsNumber, IsDateString, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateTimeOffRequestDto {
  @ApiProperty({ example: 'uuid-of-employee', required: false })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiProperty({ example: 'uuid-of-time-off-type' })
  @IsUUID()
  timeOffTypeId: string;

  @ApiProperty({ example: '2024-01-15' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-01-17' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: 3 })
  @IsNumber()
  @Type(() => Number)
  duration: number;

  @ApiProperty({ example: 'Family vacation', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
