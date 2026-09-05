import { IsString, IsOptional, IsNotEmpty, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateDepartmentDto {
  @ApiProperty({ example: 'Engineering', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiProperty({
    example: 'employee-4',
    required: false,
    nullable: true,
    description: 'Employee who leads this department. Send null to remove the head.',
  })
  @IsOptional()
  // `null` is meaningful here - it clears the head - so only validate a value.
  // Ids are opaque strings, so the format is not checked; the service verifies
  // the employee exists, is active, and is in this department.
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  headId?: string | null;
}
