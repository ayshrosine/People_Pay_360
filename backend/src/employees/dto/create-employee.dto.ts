import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EmployeeStatus } from '@prisma/client';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail()
  workEmail: string;

  @ApiProperty({ example: 'Software Engineer', required: false })
  @IsOptional()
  @IsString()
  jobPosition?: string;

  @ApiProperty({ example: 'uuid-of-department', required: false })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiProperty({ example: 'uuid-of-manager', required: false })
  @IsOptional()
  @IsString()
  managerId?: string;

  @ApiProperty({ example: 'uuid-of-working-schedule', required: false })
  @IsOptional()
  @IsString()
  workingScheduleId?: string;

  @ApiProperty({ enum: EmployeeStatus, required: false })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', required: false })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiProperty({ example: '+1234567890', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Full-time', required: false })
  @IsOptional()
  @IsString()
  employeeType?: string;

  @ApiProperty({ example: '1234567890', required: false })
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @ApiProperty({ example: 'SBIN0001234', required: false })
  @IsOptional()
  @IsString()
  bankIfsc?: string;
}
