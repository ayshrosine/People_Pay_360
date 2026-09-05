import { SetMetadata } from '@nestjs/common';
import { Action, Subject } from '../abilities/ability.factory';

export const ABILITY_KEY = 'ability';

export interface AbilityMetadata {
  action: Action;
  subject: Subject;
}

/**
 * Declares the ability required to call a handler. Enforced by `AbilitiesGuard`,
 * which is registered globally in `CommonModule`.
 */
export const CheckAbility = (...requirements: AbilityMetadata[]) =>
  SetMetadata(ABILITY_KEY, requirements);

export const DEPARTMENT_HEAD_KEY = 'allowDepartmentHead';

/**
 * Lets a department head through the role guard so the handler can make the
 * real decision per record.
 *
 * Leading a department is a relationship, not a role: two people with the same
 * `EMPLOYEE` role differ only in which department they head, which the CASL
 * grid cannot express. The guard therefore stops rejecting on role alone, and
 * the service must then call `DepartmentHeadService.assertLeads` — otherwise
 * this decorator would simply open the endpoint up.
 */
export const AllowDepartmentHead = () => SetMetadata(DEPARTMENT_HEAD_KEY, true);
