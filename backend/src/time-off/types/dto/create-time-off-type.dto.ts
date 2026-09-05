import { IsString, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TimeOffUnit } from '@prisma/client';

export class CreateTimeOffTypeDto {
  @ApiProperty({ example: 'Annual Leave' })
  @IsString()
  name: string;

  @ApiProperty({ enum: TimeOffUnit, required: false })
  @IsOptional()
  @IsEnum(TimeOffUnit)
  unit?: TimeOffUnit;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  requiresAllocation?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  affectsPayroll?: boolean;

  @ApiProperty({ example: '#6366F1', required: false })
  @IsOptional()
  @IsString()
  colorHex?: string;
}
