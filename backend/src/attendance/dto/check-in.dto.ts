import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckInDto {
  @ApiProperty({ example: 'uuid-of-employee', required: false })
  @IsOptional()
  @IsString()
  employeeId?: string;
}
