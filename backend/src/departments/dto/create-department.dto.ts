import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Engineering' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'employee-4',
    required: false,
    description: 'Employee who leads this department and may decide its leave requests.',
  })
  // Ids are opaque strings here, not necessarily UUIDs - seeded records use
  // readable ids, and validating the format would reject perfectly valid ones.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  headId?: string;
}
