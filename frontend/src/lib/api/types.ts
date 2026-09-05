/**
 * Request/response shapes mirroring the NestJS API contract.
 *
 * These are hand-maintained rather than generated so the app compiles without
 * the API running; `npm run codegen` regenerates `schema.d.ts` from the live
 * OpenAPI document when you want to diff them against the source of truth.
 */

export type RoleName =
  | 'EMPLOYEE'
  | 'HR_MANAGER'
  | 'HR_PAYROLL_USER'
  | 'HR_PAYROLL_MANAGER'
  | 'ADMIN';

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'TERMINATED';
export type ContractStatus = 'DRAFT' | 'RUNNING' | 'EXPIRED' | 'CANCELLED';
export type AttendanceStatus =
  | 'PRESENT'
  | 'LATE'
  | 'ABSENT'
  | 'OVERTIME'
  | 'MISSING_CHECKOUT'
  | 'MANUALLY_EDITED';
export type TimeOffRequestStatus = 'TO_APPROVE' | 'APPROVED' | 'REFUSED' | 'CANCELLED';
export type TimeOffUnit = 'DAYS' | 'HOURS';
export type PayrunStatus =
  | 'DRAFT'
  | 'COMPUTING'
  | 'COMPUTED'
  | 'VALIDATED'
  | 'PAID'
  | 'ERROR';
export type PayslipStatus =
  | 'DRAFT'
  | 'COMPUTED'
  | 'WAITING'
  | 'VALIDATED'
  | 'PAID'
  | 'ERROR';
export type SalaryCategory = 'BASIC' | 'ALLOWANCE' | 'GROSS' | 'DEDUCTION' | 'NET';
export type ComputationType = 'FIXED' | 'PERCENTAGE' | 'FORMULA' | 'PYTHON_LIKE';

/** Every endpoint answers in this envelope; lists add `meta`. */
export interface ApiEnvelope<T> {
  data: T;
  meta?: PaginationMeta & Record<string, unknown>;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta & Record<string, unknown>;
}

/** Business errors the UI branches on to show a precise inline message. */
export type ApiErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'VALIDATION_FAILED'
  | 'OVERLAPPING_CONTRACT'
  | 'NO_ACTIVE_CONTRACT'
  | 'INSUFFICIENT_BALANCE'
  | 'NO_ALLOCATION'
  | 'DUPLICATE_PAYSLIP'
  | 'BLOCKING_WARNINGS'
  | 'INVALID_PAYRUN_STATE'
  | 'PAYRUN_IMMUTABLE'
  | 'EMPTY_SALARY_STRUCTURE'
  | 'EMAIL_ALREADY_EXISTS'
  | 'NO_LINKED_EMPLOYEE'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | (string & {});

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  code?: ApiErrorCode;
  errors?: unknown;
  path?: string;
  timestamp?: string;
}

export interface DepartmentHead {
  id: string;
  name: string;
  workEmail: string;
  avatarUrl?: string | null;
}

export interface Department {
  id: string;
  name: string;
  /**
   * The employee who leads this department. They may approve and refuse leave
   * for its members - authority that comes from this relationship, not from
   * their role.
   */
  headId?: string | null;
  head?: DepartmentHead | null;
  _count?: { employees: number };
}

export interface WorkingScheduleLine {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

export interface WorkingSchedule {
  id: string;
  name: string;
  company: string;
  timezone: string;
  scheduleType: string;
  totalWeeklyHours: number;
  status: string;
  lines: WorkingScheduleLine[];
  _count?: { employees: number; contracts: number };
}

export interface Employee {
  id: string;
  name: string;
  workEmail: string;
  jobPosition: string | null;
  departmentId: string | null;
  department: Department | null;
  managerId: string | null;
  manager: Pick<Employee, 'id' | 'name'> | null;
  status: EmployeeStatus;
  avatarUrl: string | null;
  phone: string | null;
  employeeType: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contract {
  id: string;
  employeeId: string;
  employee?: Employee;
  department: string | null;
  jobPosition: string | null;
  startDate: string;
  endDate: string | null;
  wage: string | number;
  wageType: string;
  salaryStructureId: string | null;
  salaryStructure: SalaryStructure | null;
  workingScheduleId: string | null;
  workingSchedule: WorkingSchedule | null;
  status: ContractStatus;
}

export interface Attendance {
  id: string;
  employeeId: string;
  employee?: Employee;
  checkIn: string;
  checkOut: string | null;
  workedHours: number | null;
  status: AttendanceStatus;
  isManualEdit: boolean;
  editedById: string | null;
  notes: string | null;
}

export interface TimeOffType {
  id: string;
  name: string;
  unit: TimeOffUnit;
  requiresAllocation: boolean;
  requiresApproval: boolean;
  affectsPayroll: boolean;
  colorHex: string;
}

export interface TimeOffAllocation {
  id: string;
  employeeId: string;
  employee?: Employee;
  timeOffTypeId: string;
  timeOffType?: TimeOffType;
  allocated: number;
  taken: number;
  remaining: number;
  validFrom: string;
  validTo: string | null;
  status: string;
}

export interface TimeOffRequest {
  id: string;
  employeeId: string;
  employee?: Employee;
  timeOffTypeId: string;
  timeOffType?: TimeOffType;
  startDate: string;
  endDate: string;
  duration: number;
  status: TimeOffRequestStatus;
  reason: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface SalaryRule {
  id: string;
  structureId: string;
  name: string;
  code: string;
  category: SalaryCategory;
  sequence: number;
  computationType: ComputationType;
  amount: string | null;
  percentageOf: string | null;
  percentageValue: string | null;
  formula: string | null;
  condition: string | null;
  active: boolean;
}

export interface SalaryStructure {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  rules?: SalaryRule[];
  _count?: { rules: number; contracts: number };
}

export interface PayslipLine {
  id: string;
  payslipId: string;
  ruleCode: string;
  label: string;
  category: SalaryCategory;
  amount: string;
  sequence: number;
}

export interface PayslipWarning {
  code: string;
  severity: 'blocking' | 'info';
  message: string;
}

export interface Payslip {
  id: string;
  payrunId: string;
  payrun?: Payrun;
  employeeId: string;
  employee?: Employee;
  contractId: string;
  workedDays: number;
  grossAmount: string;
  netAmount: string;
  status: PayslipStatus;
  warnings: PayslipWarning[] | null;
  lines: PayslipLine[];
  pdfUrl: string | null;
  emailSentAt: string | null;
  createdAt: string;
}

export interface Payrun {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  salaryStructureId: string;
  salaryStructure?: SalaryStructure;
  employeeType: string | null;
  status: PayrunStatus;
  payslips?: Payslip[];
  employeeCount?: number;
  totalNet?: number;
  totals?: { employeeCount: number; gross: number; net: number };
  blockingWarnings?: BlockingWarning[];
  createdAt: string;
  validatedAt: string | null;
  paidAt: string | null;
}

export interface BlockingWarning {
  payslipId: string;
  employeeId: string;
  employeeName?: string;
  code: string;
  message: string;
}

/** One row of the payrun wizard's "Select Employee Records" table. */
export interface ScopeCandidate {
  id: string;
  name: string;
  workEmail: string;
  jobPosition: string | null;
  employeeType: string | null;
  department: string | null;
  departmentId: string | null;
  workingHours: number | null;
  startDate: string | null;
  wage: number | null;
  wageType: string | null;
  contractId: string | null;
  contractSalaryStructureId: string | null;
}

export interface AppUser {
  id: string;
  email: string;
  role: RoleName;
  isActive: boolean;
  employeeId: string | null;
  employee: Employee | null;
  /**
   * Departments this user leads. A head may approve and refuse leave for their
   * members — authority that comes from the relationship, not the role, so it
   * cannot be derived from `role` alone.
   */
  headedDepartments?: { id: string; name: string }[];
  createdAt?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AppUser;
}

export interface DashboardKpis {
  totalNetSalaryPaid: number;
  payslipsGenerated: number;
  avgSalary: number;
  approvedTimeOffDays: number;
  attendanceHealthPct: number;
}

export interface DashboardAlerts {
  errorPayslips: { code: string; message: string; payslipId: string }[];
  employeesWithoutBank: { code: string; message: string; employeeId: string }[];
  contractsEndingSoon: { code: string; message: string; contractId: string }[];
}

export interface AttendanceOverview {
  present: number;
  late: number;
  absent: number;
  overtime: number;
  missingCheckouts: number;
  manualEdits: number;
  coveragePct: number;
}

export interface TimeOffOverview {
  approvedDays: number;
  pendingRequests: number;
  byType: { type: string; days: number }[];
}

export interface DepartmentOverviewRow {
  department: string;
  headcount: number;
  totalSalary: number;
}
