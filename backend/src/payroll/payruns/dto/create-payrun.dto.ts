import { IsString, IsDateString, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePayrunDto {
  @ApiProperty({ example: 'January 2024' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'uuid-of-salary-structure' })
  @IsString()
  salaryStructureId: string;

  @ApiProperty({ example: '2024-01-01' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ example: '2024-01-31' })
  @IsDateString()
  periodEnd: string;

  @IsOptional()
  @ApiProperty({ example: 'Full-time', required: false })
  @IsString()
  employeeType?: string;

  @ApiProperty({ example: ['uuid1', 'uuid2', 'uuid3'] })
  @IsArray()
  @IsString({ each: true })
  employeeIds: string[];
}
