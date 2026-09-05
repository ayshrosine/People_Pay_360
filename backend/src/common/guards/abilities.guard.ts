import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AbilityFactory, RequestUser } from '../abilities/ability.factory';
import {
  ABILITY_KEY,
  AbilityMetadata,
  DEPARTMENT_HEAD_KEY,
} from '../decorators/check-ability.decorator';
import { DepartmentHeadService } from '../abilities/department-head.service';

@Injectable()
export class AbilitiesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory,
    private readonly departmentHeads: DepartmentHeadService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const failed = requirements.filter(({ action, subject }) => !ability.can(action, subject));
    if (failed.length === 0) return true;

    // A handler may opt into letting department heads past the role check. The
    // handler is then *required* to authorise the specific record itself, via
    // DepartmentHeadService - this only defers the decision, it never grants it.
    const allowsDepartmentHead = this.reflector.getAllAndOverride<boolean>(DEPARTMENT_HEAD_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (allowsDepartmentHead && (await this.departmentHeads.isHeadOfAnyDepartment(user))) {
      return true;
    }

    const { action, subject } = failed[0];
    throw new ForbiddenException({
      message: `You do not have permission to ${action} ${subject}.`,
      code: 'FORBIDDEN',
    });
  }
}
