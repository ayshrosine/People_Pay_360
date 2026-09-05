import type { RoleName } from '@/lib/api/types';

/**
 * A frontend mirror of the backend's CASL policies, used purely to hide or
 * disable actions a role cannot perform. It is a usability layer, never a
 * security one - the API enforces the same rules and is the only thing that
 * actually protects the data.
 */

export type Action = 'read' | 'create' | 'update' | 'delete' | 'manage';

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
  | 'Dashboard';

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

type Policy = Partial<Record<Subject, Action[]>>;

const ALL: Action[] = ['read', 'create', 'update', 'delete', 'manage'];

function grant(subjects: Subject[], actions: Action[]): Policy {
  return Object.fromEntries(subjects.map((subject) => [subject, actions])) as Policy;
}

const POLICIES: Record<RoleName, Policy> = {
  EMPLOYEE: {
    Employee: ['read'],
    Contract: ['read'],
    Attendance: ['read', 'create'],
    TimeOffType: ['read'],
    TimeOffRequest: ['read', 'create'],
    TimeOffAllocation: ['read'],
    Payslip: ['read'],
  },
  HR_MANAGER: {
    ...grant(HR_SUBJECTS, ALL),
    Dashboard: ['read'],
  },
  HR_PAYROLL_USER: {
    ...grant(HR_SUBJECTS, ALL),
    Payrun: ['read', 'create', 'update'],
    Payslip: ['read', 'create', 'update'],
    SalaryStructure: ['read'],
    SalaryRule: ['read'],
    Dashboard: ['read'],
  },
  HR_PAYROLL_MANAGER: {
    ...grant(
      [...HR_SUBJECTS, 'Payrun', 'Payslip', 'SalaryStructure', 'SalaryRule'],
      ALL,
    ),
    Dashboard: ['read'],
  },
  ADMIN: {
    ...grant(
      [
        ...HR_SUBJECTS,
        'User',
        'Payrun',
        'Payslip',
        'SalaryStructure',
        'SalaryRule',
        'Dashboard',
      ],
      ALL,
    ),
  },
};

export function can(
  role: RoleName | null | undefined,
  action: Action,
  subject: Subject,
): boolean {
  if (!role) return false;
  const allowed = POLICIES[role]?.[subject];
  if (!allowed) return false;
  return allowed.includes('manage') || allowed.includes(action);
}

/** True for roles that only ever see their own records. */
export function isSelfService(role: RoleName | null | undefined): boolean {
  return role === 'EMPLOYEE';
}

/**
 * Where a role should land after signing in.
 *
 * The payroll dashboard is an HR view; sending a self-service employee there
 * would drop them on a page every widget of which their role is forbidden to
 * read. Their own attendance is the useful home.
 */
export function homeRouteFor(role: RoleName | null | undefined): string {
  if (!role) return '/login';
  return can(role, 'read', 'Dashboard') ? '/dashboard' : '/time-off/attendance';
}

export const ROLE_LABELS: Record<RoleName, string> = {
  EMPLOYEE: 'Employee',
  HR_MANAGER: 'HR Manager',
  HR_PAYROLL_USER: 'HR Payroll User',
  HR_PAYROLL_MANAGER: 'HR Payroll Manager',
  ADMIN: 'Administrator',
};
