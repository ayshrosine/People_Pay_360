import { IsDateString, IsOptional, IsString, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PreviewScopeDto {
  @ApiProperty({ example: 'uuid-of-salary-structure' })
  @IsString()
  salaryStructureId: string;

  @ApiProperty({ example: '2024-01-01' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ example: '2024-01-31' })
  @IsDateString()
  periodEnd: string;

  @ApiProperty({ example: 'Full-time', required: false })
  @IsOptional()
  @IsString()
  employeeType?: string;
}
