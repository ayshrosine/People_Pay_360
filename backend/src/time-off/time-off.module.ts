import { Module } from '@nestjs/common';
import { TimeOffTypesModule } from './types/time-off-types.module';
import { TimeOffAllocationsModule } from './allocations/time-off-allocations.module';
import { TimeOffRequestsModule } from './requests/time-off-requests.module';

@Module({
  imports: [
    TimeOffTypesModule,
    TimeOffAllocationsModule,
    TimeOffRequestsModule,
  ],
  exports: [
    TimeOffTypesModule,
    TimeOffAllocationsModule,
    TimeOffRequestsModule,
  ],
})
export class TimeOffModule {}
