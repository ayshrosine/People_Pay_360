import { ForbiddenException } from '@nestjs/common';
import { RequestUser } from '../abilities/ability.factory';

/**
 * CASL's `can(action, 'Employee')` answers "may this role read employees at
 * all", not "may they read *this* employee". That check alone lets an
 * EMPLOYEE list every colleague's salary and bank details.
 *
 * These helpers close the gap by forcing the query itself down to the caller's
 * own records. Roles above EMPLOYEE keep whatever filter they asked for.
 */

export function isSelfServiceOnly(user: RequestUser | undefined): boolean {
  return user?.role === 'EMPLOYEE';
}

/**
 * Resolves the `employeeId` a list query must be filtered by.
 *
 * - Privileged roles: the requested filter, unchanged (undefined = everyone).
 * - EMPLOYEE: always their own id, whatever they asked for.
 */
export function resolveEmployeeScope(
  user: RequestUser | undefined,
  requestedEmployeeId?: string,
): string | undefined {
  if (!isSelfServiceOnly(user)) {
    return requestedEmployeeId;
  }

  if (!user?.employeeId) {
    throw new ForbiddenException({
      message: 'This account is not linked to an employee record.',
      code: 'NO_LINKED_EMPLOYEE',
    });
  }

  return user.employeeId;
}

/** Guards single-record access for self-service users. */
export function assertOwnsEmployeeRecord(
  user: RequestUser | undefined,
  ownerEmployeeId: string | null | undefined,
): void {
  if (!isSelfServiceOnly(user)) return;

  if (!user?.employeeId || user.employeeId !== ownerEmployeeId) {
    throw new ForbiddenException({
      message: 'You can only access your own records.',
      code: 'FORBIDDEN',
    });
  }
}
