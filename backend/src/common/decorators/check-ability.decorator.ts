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
