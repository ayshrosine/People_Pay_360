import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSalaryStructureDto {
  @ApiProperty({ example: 'Monthly Salary Structure' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Standard monthly salary structure for full-time employees', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
