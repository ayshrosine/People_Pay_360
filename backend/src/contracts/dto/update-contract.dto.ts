import { IsString, IsOptional, IsDateString, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ContractStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateContractDto {
  @ApiProperty({ example: 'uuid-of-employee', required: false })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiProperty({ example: 'Engineering', required: false })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ example: 'Software Engineer', required: false })
  @IsOptional()
  @IsString()
  jobPosition?: string;

  @ApiProperty({ example: '2024-01-01', required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ example: '2024-12-31', required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ example: 50000.00, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  wage?: number;

  @ApiProperty({ example: 'Monthly', required: false })
  @IsOptional()
  @IsString()
  wageType?: string;

  @ApiProperty({ example: 'uuid-of-salary-structure', required: false })
  @IsOptional()
  @IsString()
  salaryStructureId?: string;

  @ApiProperty({ example: 'uuid-of-working-schedule', required: false })
  @IsOptional()
  @IsString()
  workingScheduleId?: string;

  @ApiProperty({ enum: ContractStatus, required: false })
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;
}
