import { Module } from '@nestjs/common';
import { PayrunsController } from './payruns.controller';
import { PayrunsService } from './payruns.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PayrunsController],
  providers: [PayrunsService],
  exports: [PayrunsService],
})
export class PayrunsModule {}
