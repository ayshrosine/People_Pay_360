import { IsString, IsUUID, IsDateString, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePayrunDto {
  @ApiProperty({ example: 'January 2024' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'uuid-of-salary-structure' })
  @IsUUID()
  salaryStructureId: string;

  @ApiProperty({ example: '2024-01-01' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ example: '2024-01-31' })
  @IsDateString()
  periodEnd: string;

  @ApiProperty({ example: 'Full-time', required: false })
  @IsString()
  employeeType?: string;

  @ApiProperty({ example: ['uuid1', 'uuid2', 'uuid3'] })
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each employee ID must be a valid UUID' })
  employeeIds: string[];
}
