import { IsUUID, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckInDto {
  @ApiProperty({ example: 'uuid-of-employee', required: false })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
