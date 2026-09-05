import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSalaryStructureDto {
  @ApiProperty({ example: 'Monthly Salary Structure', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'Standard monthly salary structure for full-time employees', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
