import { IsString, IsEnum, IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SalaryCategory, ComputationType } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateSalaryRuleDto {
  @ApiProperty({ example: 'Basic Salary', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'BASIC', required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ enum: SalaryCategory, required: false })
  @IsOptional()
  @IsEnum(SalaryCategory)
  category?: SalaryCategory;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sequence?: number;

  @ApiProperty({ enum: ComputationType, required: false })
  @IsOptional()
  @IsEnum(ComputationType)
  computationType?: ComputationType;

  @ApiProperty({ example: 50000.00, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  amount?: number;

  @ApiProperty({ example: 'BASIC', required: false })
  @IsOptional()
  @IsString()
  percentageOf?: string;

  @ApiProperty({ example: 12, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  percentageValue?: number;

  @ApiProperty({ example: 'BASIC * 0.12', required: false })
  @IsOptional()
  @IsString()
  formula?: string;

  @ApiProperty({ example: 'workedDays >= 20', required: false })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
