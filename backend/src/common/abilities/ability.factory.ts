import { Injectable } from '@nestjs/common';
import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
  MongoQuery,
} from '@casl/ability';
import { RoleName } from '@prisma/client';

export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete';

export type Subject =
  | 'User'
  | 'Employee'
  | 'Department'
  | 'Contract'
  | 'WorkingSchedule'
  | 'Attendance'
  | 'TimeOffType'
  | 'TimeOffRequest'
  | 'TimeOffAllocation'
  | 'SalaryStructure'
  | 'SalaryRule'
  | 'Payrun'
  | 'Payslip'
  | 'Dashboard'
  | 'all';

export type AppAbility = MongoAbility<[Action, Subject], MongoQuery>;

/** The shape the JwtStrategy puts on `request.user`. */
export interface RequestUser {
  id: string;
  email: string;
  role: RoleName;
  employeeId: string | null;
}

const HR_SUBJECTS: Subject[] = [
  'Employee',
  'Department',
  'Contract',
  'WorkingSchedule',
  'Attendance',
  'TimeOffRequest',
  'TimeOffAllocation',
  'TimeOffType',
];

@Injectable()
export class AbilityFactory {
  defineAbilityFor(user: RequestUser | undefined | null): AppAbility {
    // NOTE: `createMongoAbility` must be passed as a *factory reference*, not invoked.
    // Passing `createMongoAbility()` silently produced an ability whose rules were
    // never applied, which made every @CheckAbility check meaningless.
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    switch (user?.role) {
      case 'EMPLOYEE':
        // An employee only ever sees their own records.
        can('read', 'Employee', { id: user.employeeId } as any);
        can('read', 'Attendance', { employeeId: user.employeeId } as any);
        can('create', 'Attendance', { employeeId: user.employeeId } as any);
        can('read', 'Contract', { employeeId: user.employeeId } as any);
        can('create', 'TimeOffRequest', { employeeId: user.employeeId } as any);
        can('read', 'TimeOffRequest', { employeeId: user.employeeId } as any);
        can('read', 'TimeOffAllocation', { employeeId: user.employeeId } as any);
        can('read', 'TimeOffType');
        can('read', 'Payslip', { employeeId: user.employeeId } as any);
        break;

      case 'HR_MANAGER':
        can('manage', HR_SUBJECTS);
        can('read', 'Dashboard');
        break;

      case 'HR_PAYROLL_USER':
        can('manage', HR_SUBJECTS);
        can(['read', 'create', 'update'], ['Payrun', 'Payslip']);
        can('read', ['SalaryStructure', 'SalaryRule']);
        can('read', 'Dashboard');
        break;

      case 'HR_PAYROLL_MANAGER':
        can('manage', [
          ...HR_SUBJECTS,
          'Payrun',
          'Payslip',
          'SalaryStructure',
          'SalaryRule',
        ]);
        can('read', 'Dashboard');
        break;

      case 'ADMIN':
        can('manage', 'all');
        break;

      default:
        // No role => no abilities. Guard will reject.
        break;
    }

    return build();
  }
}
