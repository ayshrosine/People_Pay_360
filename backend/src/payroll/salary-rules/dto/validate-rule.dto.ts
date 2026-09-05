import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ValidateRuleDto {
  @ApiProperty({ example: 'BASIC * 0.12' })
  @IsString()
  formula: string;

  @ApiProperty({ example: { BASIC: 50000, workedDays: 22, totalDays: 22 }, required: false })
  @IsOptional()
  context?: Record<string, number>;
}
