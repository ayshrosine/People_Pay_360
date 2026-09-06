import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * The payslips a bulk action applies to.
 *
 * Always explicit — never "everything currently on screen". A filtered list and
 * a stale tab both make "all" mean something different to the user than to the
 * server, and these actions move money.
 */
export class PayslipSelectionDto {
  @ApiProperty({ example: ['payslip-uuid-1', 'payslip-uuid-2'] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Select at least one payslip.' })
  @IsString({ each: true })
  payslipIds: string[];
}
