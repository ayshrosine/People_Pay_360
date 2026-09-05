import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';

export class UpdateUserDto {
  @ApiProperty({ enum: RoleName, required: false })
  @IsOptional()
  @IsEnum(RoleName)
  role?: RoleName;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
