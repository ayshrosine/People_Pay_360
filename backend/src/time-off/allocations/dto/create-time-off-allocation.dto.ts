import { IsUUID, IsNumber, IsDateString, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateTimeOffAllocationDto {
  @ApiProperty({ example: 'uuid-of-employee' })
  @IsUUID()
  employeeId: string;

  @ApiProperty({ example: 'uuid-of-time-off-type' })
  @IsUUID()
  timeOffTypeId: string;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @Type(() => Number)
  allocated: number;

  @ApiProperty({ example: '2024-01-01' })
  @IsDateString()
  validFrom: string;

  @ApiProperty({ example: '2024-12-31', required: false })
  @IsOptional()
  @IsDateString()
  validTo?: string;

  @ApiProperty({ example: 'To Approve', required: false })
  @IsOptional()
  @IsString()
  status?: string;
}
