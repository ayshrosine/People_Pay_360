import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AbilityFactory } from '../abilities/ability.factory';
import { ABILITY_KEY, AbilityMetadata } from '../decorators/check-ability.decorator';
import { ForbiddenException } from '@nestjs/common';

@Injectable()
export class AbilitiesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private abilityFactory: AbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredAbility = this.reflector.get<AbilityMetadata>(
      ABILITY_KEY,
      context.getHandler(),
    );

    if (!requiredAbility) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const ability = this.abilityFactory.defineAbilityFor(user);

    if (ability.can(requiredAbility.action, requiredAbility.subject)) {
      return true;
    }

    throw new ForbiddenException('You do not have permission to perform this action');
  }
}
