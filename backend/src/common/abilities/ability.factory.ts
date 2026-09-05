import { Injectable } from '@nestjs/common';
// @ts-ignore
import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { User } from '@prisma/client';

export interface AppAbility {
  can: (action: string, subject: string) => boolean;
}

@Injectable()
export class AbilityFactory {
  defineAbilityFor(user: User) {
    // @ts-ignore
    const { can, cannot, build } = new AbilityBuilder(createMongoAbility());

    switch (user.role) {
      case 'EMPLOYEE':
        can('read', 'Attendance', { employeeId: user.employeeId });
        can('create', 'TimeOffRequest', { employeeId: user.employeeId });
        can('read', 'TimeOffAllocation', { employeeId: user.employeeId });
        can('read', 'Payslip', { employeeId: user.employeeId });
        break;
      case 'HR_MANAGER':
        can('manage', ['Employee', 'Contract', 'WorkingSchedule', 'Attendance', 'TimeOffRequest', 'TimeOffAllocation', 'TimeOffType']);
        break;
      case 'HR_PAYROLL_USER':
        can('manage', ['Employee', 'Contract', 'WorkingSchedule', 'Attendance', 'TimeOffRequest', 'TimeOffAllocation', 'TimeOffType']);
        can(['read', 'create', 'update'], ['Payrun', 'Payslip']);
        can('read', ['SalaryStructure', 'SalaryRule']);
        break;
      case 'HR_PAYROLL_MANAGER':
        can('manage', ['Employee', 'Contract', 'WorkingSchedule', 'Attendance', 'TimeOffRequest', 'TimeOffAllocation', 'TimeOffType', 'Payrun', 'Payslip', 'SalaryStructure', 'SalaryRule']);
        break;
      case 'ADMIN':
        can('manage', 'all');
        break;
    }

    return build();
  }
}
