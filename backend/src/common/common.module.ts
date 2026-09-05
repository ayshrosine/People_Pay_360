import { Global, Module } from '@nestjs/common';
import { AbilityFactory } from './abilities/ability.factory';
import { DepartmentHeadService } from './abilities/department-head.service';

/**
 * Exposes cross-cutting providers (currently the CASL ability factory) to every
 * feature module without each one having to import them explicitly. The
 * `AbilitiesGuard` that consumes `AbilityFactory` is registered as an APP_GUARD
 * in `AppModule`, and global guards are resolved from the root injector — so
 * this module must be global for that resolution to succeed.
 */
@Global()
@Module({
  providers: [AbilityFactory, DepartmentHeadService],
  exports: [AbilityFactory, DepartmentHeadService],
})
export class CommonModule {}
