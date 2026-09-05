import { Module } from '@nestjs/common';
import { SalaryStructuresController } from './salary-structures.controller';
import { SalaryStructuresService } from './salary-structures.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SalaryStructuresController],
  providers: [SalaryStructuresService],
  exports: [SalaryStructuresService],
})
export class SalaryStructuresModule {}
