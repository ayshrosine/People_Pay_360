import { IsString, IsOptional, IsUUID, IsDateString, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ContractStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateContractDto {
  @ApiProperty({ example: 'uuid-of-employee' })
  @IsUUID()
  employeeId: string;

  @ApiProperty({ example: 'Engineering', required: false })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ example: 'Software Engineer', required: false })
  @IsOptional()
  @IsString()
  jobPosition?: string;

  @ApiProperty({ example: '2024-01-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-12-31', required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ example: 50000.00 })
  @IsNumber()
  @Type(() => Number)
  wage: number;

  @ApiProperty({ example: 'Monthly', required: false })
  @IsOptional()
  @IsString()
  wageType?: string;

  @ApiProperty({ example: 'uuid-of-salary-structure', required: false })
  @IsOptional()
  @IsUUID()
  salaryStructureId?: string;

  @ApiProperty({ example: 'uuid-of-working-schedule', required: false })
  @IsOptional()
  @IsUUID()
  workingScheduleId?: string;

  @ApiProperty({ enum: ContractStatus, required: false })
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;
}
