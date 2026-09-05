import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateDepartmentDto {
  @ApiProperty({ example: 'Engineering', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;
}
