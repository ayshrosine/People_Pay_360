declare module '@casl/ability' {
  export type Ability<T> = T;
  export type AbilityBuilder<T> = any;
  export function createMongoAbility<T>(): T;
  export function AbilityBuilder<T>(ability: T): AbilityBuilder<T>;
}
