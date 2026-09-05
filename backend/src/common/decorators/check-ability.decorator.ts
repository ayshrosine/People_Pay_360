import { SetMetadata } from '@nestjs/common';

export const ABILITY_KEY = 'ability';
export interface AbilityMetadata {
  action: string;
  subject: string;
}

export const CheckAbility = (metadata: AbilityMetadata) => 
  SetMetadata(ABILITY_KEY, metadata);
