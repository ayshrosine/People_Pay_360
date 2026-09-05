import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AbilityFactory, RequestUser } from '../abilities/ability.factory';
import { ABILITY_KEY, AbilityMetadata } from '../decorators/check-ability.decorator';

@Injectable()
export class AbilitiesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Merge handler- and class-level requirements so a controller can declare a
    // baseline and a single method can tighten it.
    const requirements = this.reflector.getAllAndOverride<AbilityMetadata[]>(ABILITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requirements || requirements.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<{ user?: RequestUser }>().user;
    const ability = this.abilityFactory.defineAbilityFor(user);

    for (const { action, subject } of requirements) {
      if (!ability.can(action, subject)) {
        throw new ForbiddenException({
          message: `You do not have permission to ${action} ${subject}.`,
          code: 'FORBIDDEN',
        });
      }
    }

    return true;
  }
}
