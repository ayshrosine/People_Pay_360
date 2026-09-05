import { IsEmail, IsString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  password: string;

  @ApiProperty({ enum: RoleName, example: 'EMPLOYEE' })
  @IsEnum(RoleName)
  role: RoleName;

  @ApiProperty({ example: 'uuid-of-employee', required: false })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
