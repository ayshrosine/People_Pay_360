'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { deleteData, getData, getList, normaliseError, patchData, postData } from '@/lib/api/client';
import type {
  AppUser,
  Attendance,
  AttendanceOverview,
  BlockingWarning,
  Contract,
  DashboardAlerts,
  DashboardKpis,
  Department,
  DepartmentOverviewRow,
  Employee,
  Paginated,
  Payrun,
  Payslip,
  SalaryRule,
  SalaryStructure,
  ScopeCandidate,
  TimeOffAllocation,
  TimeOffOverview,
  TimeOffRequest,
  TimeOffType,
  WorkingSchedule,
} from '@/lib/api/types';

/**
 * One query-key namespace per resource. Mutations invalidate by prefix, which
 * is what keeps the cross-links honest: approving leave has to refresh the
 * allocation balance and the dashboard, not just the request list.
 */
export const keys = {
  me: ['me'] as const,
  users: (params?: unknown) => ['users', params ?? {}] as const,
  employees: (params?: unknown) => ['employees', params ?? {}] as const,
  employee: (id: string) => ['employees', 'detail', id] as const,
  employeeTimeline: (id: string) => ['employees', 'timeline', id] as const,
  departments: ['departments'] as const,
  contracts: (params?: unknown) => ['contracts', params ?? {}] as const,
  contract: (id: string) => ['contracts', 'detail', id] as const,
  schedules: ['working-schedules'] as const,
  schedule: (id: string) => ['working-schedules', id] as const,
  attendance: (params?: unknown) => ['attendance', params ?? {}] as const,
  attendanceToday: ['attendance', 'widget-today'] as const,
  timeOffTypes: ['time-off', 'types'] as const,
  allocations: (params?: unknown) => ['time-off', 'allocations', params ?? {}] as const,
  requests: (params?: unknown) => ['time-off', 'requests', params ?? {}] as const,
  request: (id: string) => ['time-off', 'requests', 'detail', id] as const,
  structures: ['payroll', 'structures'] as const,
  structure: (id: string) => ['payroll', 'structures', id] as const,
  rules: (structureId: string) => ['payroll', 'rules', structureId] as const,
  payruns: (params?: unknown) => ['payroll', 'payruns', params ?? {}] as const,
  payrun: (id: string) => ['payroll', 'payruns', 'detail', id] as const,
  payslips: (params?: unknown) => ['payroll', 'payslips', params ?? {}] as const,
  payslip: (id: string) => ['payroll', 'payslips', 'detail', id] as const,
  payslipExplain: (id: string) => ['payroll', 'payslips', 'explain', id] as const,
  dashboard: (widget: string, filters?: unknown) => ['dashboard', widget, filters ?? {}] as const,
};

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T>, 'queryKey' | 'queryFn'>;

/** Surfaces the backend's own message rather than a generic "request failed". */
export function useApiMutation<TData, TVars>(
  mutationFn: (vars: TVars) => Promise<TData>,
  options: {
    invalidate?: readonly unknown[][];
    successMessage?: string | ((data: TData) => string);
    onSuccess?: (data: TData, vars: TVars) => void;
    silent?: boolean;
  } = {},
) {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVars>({
    mutationFn,
    onSuccess: (data, vars) => {
      for (const key of options.invalidate ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      if (options.successMessage) {
        toast.success(
          typeof options.successMessage === 'function'
            ? options.successMessage(data)
            : options.successMessage,
        );
      }
      options.onSuccess?.(data, vars);
    },
    onError: (error) => {
      if (options.silent) return;
      toast.error(normaliseError(error).message);
    },
  });
}

/* --------------------------------------------------------------------- auth */

export function useCurrentUser(enabled = true) {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => getData<AppUser>('/auth/me'),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/* -------------------------------------------------------------------- users */

export function useUsers(params: { role?: string; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: keys.users(params),
    queryFn: () => getList<AppUser>('/users', { params }),
  });
}

export function useCreateUser() {
  return useApiMutation(
    (payload: { email: string; password: string; role: string; employeeId?: string }) =>
      postData<AppUser>('/users', payload),
    { invalidate: [['users']], successMessage: 'User created and invited.' },
  );
}

export function useUpdateUser() {
  return useApiMutation(
    ({ id, ...payload }: { id: string; role?: string; isActive?: boolean }) =>
      patchData<AppUser>(`/users/${id}`, payload),
    { invalidate: [['users']], successMessage: 'User updated.' },
  );
}

export function useDeactivateUser() {
  return useApiMutation((id: string) => deleteData(`/users/${id}`), {
    invalidate: [['users']],
    successMessage: 'User deactivated.',
  });
}

/* ---------------------------------------------------------------- employees */

export interface EmployeeQuery {
  view?: 'kanban' | 'list';
  search?: string;
  departmentId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export function useEmployees(params: EmployeeQuery = {}) {
  return useQuery({
    queryKey: keys.employees(params),
    queryFn: () => getList<Employee>('/employees', { params: clean(params) }),
    placeholderData: (previous) => previous,
  });
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: keys.employee(id ?? ''),
    queryFn: () => getData<Employee>(`/employees/${id}`),
    enabled: Boolean(id) && id !== 'new',
  });
}

export function useEmployeeTimeline(id: string | undefined) {
  return useQuery({
    queryKey: keys.employeeTimeline(id ?? ''),
    queryFn: () =>
      getData<{ type: string; date: string; data: Record<string, unknown> }[]>(
        `/employees/${id}/timeline`,
      ),
    enabled: Boolean(id) && id !== 'new',
  });
}

export function useSaveEmployee() {
  return useApiMutation(
    ({ id, ...payload }: Partial<Employee> & { id?: string }) =>
      id
        ? patchData<Employee>(`/employees/${id}`, payload)
        : postData<Employee>('/employees', payload),
    { invalidate: [['employees']], successMessage: 'Employee saved.' },
  );
}

export function useDeleteEmployee() {
  return useApiMutation((id: string) => deleteData(`/employees/${id}`), {
    invalidate: [['employees']],
    successMessage: 'Employee removed.',
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: keys.departments,
    queryFn: () => getList<Department>('/departments'),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCreateDepartment() {
  return useApiMutation((payload: { name: string }) => postData<Department>('/departments', payload), {
    invalidate: [['departments']],
    successMessage: 'Department created.',
  });
}

/* ---------------------------------------------------------------- contracts */

export function useContracts(params: { employeeId?: string } = {}) {
  return useQuery({
    queryKey: keys.contracts(params),
    queryFn: () => getList<Contract>('/contracts', { params: clean(params) }),
  });
}

export function useContract(id: string | undefined) {
  return useQuery({
    queryKey: keys.contract(id ?? ''),
    queryFn: () => getData<Contract>(`/contracts/${id}`),
    enabled: Boolean(id) && id !== 'new',
  });
}

export function useSaveContract() {
  return useApiMutation(
    ({ id, ...payload }: Record<string, unknown> & { id?: string }) =>
      id
        ? patchData<Contract>(`/contracts/${id}`, payload)
        : postData<Contract>('/contracts', payload),
    { invalidate: [['contracts'], ['employees']], silent: true },
  );
}

/* -------------------------------------------------------- working schedules */

export function useWorkingSchedules() {
  return useQuery({
    queryKey: keys.schedules,
    queryFn: () => getList<WorkingSchedule>('/working-schedules'),
  });
}

export function useWorkingSchedule(id: string | undefined) {
  return useQuery({
    queryKey: keys.schedule(id ?? ''),
    queryFn: () => getData<WorkingSchedule>(`/working-schedules/${id}`),
    enabled: Boolean(id) && id !== 'new',
  });
}

export function useSaveWorkingSchedule() {
  return useApiMutation(
    ({ id, ...payload }: Record<string, unknown> & { id?: string }) =>
      id
        ? patchData<WorkingSchedule>(`/working-schedules/${id}`, payload)
        : postData<WorkingSchedule>('/working-schedules', payload),
    { invalidate: [['working-schedules']], successMessage: 'Working schedule saved.' },
  );
}

/* --------------------------------------------------------------- attendance */

export interface AttendanceQuery {
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}

export function useAttendance(params: AttendanceQuery = {}) {
  return useQuery({
    queryKey: keys.attendance(params),
    queryFn: () => getList<Attendance>('/attendance', { params: clean(params) }),
  });
}

/** Backs the floating widget; refetches on focus so the clock is never stale. */
export function useAttendanceToday(enabled = true) {
  return useQuery({
    queryKey: keys.attendanceToday,
    // `null` is a legitimate answer - nobody has checked in yet today - but
    // TanStack Query rejects `undefined`, so normalise it.
    queryFn: async () => (await getData<Attendance | null>('/attendance/widget/today')) ?? null,
    enabled,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useCheckIn() {
  return useApiMutation(
    (payload: { employeeId?: string }) => postData<Attendance>('/attendance/check-in', payload),
    { invalidate: [['attendance']], successMessage: 'Checked in.' },
  );
}

export function useCheckOut() {
  return useApiMutation((id: string) => postData<Attendance>(`/attendance/${id}/check-out`), {
    invalidate: [['attendance']],
    successMessage: 'Checked out.',
  });
}

export function useUpdateAttendance() {
  return useApiMutation(
    ({ id, ...payload }: Record<string, unknown> & { id: string }) =>
      patchData<Attendance>(`/attendance/${id}`, payload),
    { invalidate: [['attendance']], successMessage: 'Attendance corrected.' },
  );
}

/* ----------------------------------------------------------------- time off */

export function useTimeOffTypes() {
  return useQuery({
    queryKey: keys.timeOffTypes,
    queryFn: () => getList<TimeOffType>('/time-off/types'),
    staleTime: 10 * 60 * 1000,
  });
}

export function useSaveTimeOffType() {
  return useApiMutation(
    ({ id, ...payload }: Record<string, unknown> & { id?: string }) =>
      id
        ? patchData<TimeOffType>(`/time-off/types/${id}`, payload)
        : postData<TimeOffType>('/time-off/types', payload),
    { invalidate: [['time-off']], successMessage: 'Time off type saved.' },
  );
}

export function useAllocations(params: { employeeId?: string } = {}) {
  return useQuery({
    queryKey: keys.allocations(params),
    queryFn: () => getList<TimeOffAllocation>('/time-off/allocations', { params: clean(params) }),
  });
}

export function useCreateAllocation() {
  return useApiMutation(
    (payload: Record<string, unknown>) =>
      postData<TimeOffAllocation>('/time-off/allocations', payload),
    { invalidate: [['time-off']], successMessage: 'Allocation created.' },
  );
}

export function useApproveAllocation() {
  return useApiMutation(
    (id: string) => patchData<TimeOffAllocation>(`/time-off/allocations/${id}/approve`),
    { invalidate: [['time-off']], successMessage: 'Allocation approved.' },
  );
}

export function useTimeOffRequests(params: { employeeId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: keys.requests(params),
    queryFn: () => getList<TimeOffRequest>('/time-off/requests', { params: clean(params) }),
  });
}

export function useTimeOffRequest(id: string | undefined) {
  return useQuery({
    queryKey: keys.request(id ?? ''),
    queryFn: () => getData<TimeOffRequest>(`/time-off/requests/${id}`),
    enabled: Boolean(id) && id !== 'new',
  });
}

export function useCreateTimeOffRequest() {
  return useApiMutation(
    (payload: Record<string, unknown>) => postData<TimeOffRequest>('/time-off/requests', payload),
    { invalidate: [['time-off']], silent: true },
  );
}

export function useDecideTimeOffRequest() {
  return useApiMutation(
    ({ id, decision }: { id: string; decision: 'approve' | 'refuse' }) =>
      patchData<TimeOffRequest>(`/time-off/requests/${id}/${decision}`),
    {
      // Approval moves the allocation balance too, so refresh the whole module.
      invalidate: [['time-off'], ['dashboard']],
      successMessage: (data) => `Request ${data.status === 'APPROVED' ? 'approved' : 'refused'}.`,
    },
  );
}

/* ------------------------------------------------------------------ payroll */

export function useSalaryStructures() {
  return useQuery({
    queryKey: keys.structures,
    queryFn: () => getList<SalaryStructure>('/payroll/structures'),
  });
}

export function useSalaryStructure(id: string | undefined) {
  return useQuery({
    queryKey: keys.structure(id ?? ''),
    queryFn: () => getData<SalaryStructure>(`/payroll/structures/${id}`),
    enabled: Boolean(id) && id !== 'new',
  });
}

export function useSaveSalaryStructure() {
  return useApiMutation(
    ({ id, ...payload }: Record<string, unknown> & { id?: string }) =>
      id
        ? patchData<SalaryStructure>(`/payroll/structures/${id}`, payload)
        : postData<SalaryStructure>('/payroll/structures', payload),
    { invalidate: [['payroll']], successMessage: 'Salary structure saved.' },
  );
}

export function useSalaryRules(structureId: string | undefined) {
  return useQuery({
    queryKey: keys.rules(structureId ?? ''),
    queryFn: () => getList<SalaryRule>(`/payroll/structures/${structureId}/rules`),
    enabled: Boolean(structureId),
  });
}

export function useSaveSalaryRule(structureId: string) {
  return useApiMutation(
    ({ id, ...payload }: Record<string, unknown> & { id?: string }) =>
      id
        ? patchData<SalaryRule>(`/payroll/structures/${structureId}/rules/${id}`, payload)
        : postData<SalaryRule>(`/payroll/structures/${structureId}/rules`, payload),
    { invalidate: [['payroll']], successMessage: 'Salary rule saved.' },
  );
}

export function useDeleteSalaryRule(structureId: string) {
  return useApiMutation(
    (ruleId: string) => deleteData(`/payroll/structures/${structureId}/rules/${ruleId}`),
    { invalidate: [['payroll']], successMessage: 'Salary rule deleted.' },
  );
}

export interface FormulaCheck {
  valid: boolean;
  result?: number;
  error?: string;
}

/** Dry-runs a formula for the live rule editor. */
export function useValidateFormula() {
  return useApiMutation(
    (payload: { formula: string; context?: Record<string, number> }) =>
      postData<FormulaCheck>('/payroll/rules/validate', payload),
    { silent: true },
  );
}

export function usePayruns(params: { status?: string } = {}, enabled = true) {
  return useQuery({
    queryKey: keys.payruns(params),
    queryFn: () => getList<Payrun>('/payroll/payruns', { params: clean(params) }),
    // Self-service roles are forbidden this endpoint; asking anyway just earns
    // a 403 in the console and a failed query for a filter they never see.
    enabled,
  });
}

export function usePayrun(id: string | undefined, options: QueryOpts<Payrun> = {}) {
  return useQuery({
    queryKey: keys.payrun(id ?? ''),
    queryFn: () => getData<Payrun>(`/payroll/payruns/${id}`),
    enabled: Boolean(id),
    ...options,
  });
}

export function usePreviewScope() {
  return useApiMutation(
    (payload: {
      salaryStructureId: string;
      periodStart: string;
      periodEnd: string;
      employeeType?: string;
    }) => postData<ScopeCandidate[]>('/payroll/payruns/preview-scope', payload),
    { silent: true },
  );
}

export function useCreatePayrun() {
  return useApiMutation(
    (payload: {
      name: string;
      salaryStructureId: string;
      periodStart: string;
      periodEnd: string;
      employeeType?: string;
      employeeIds: string[];
    }) => postData<Payrun>('/payroll/payruns', payload),
    { invalidate: [['payroll']], silent: true },
  );
}

/** Compute / Validate / Mark Paid / Send - the payrun state machine. */
export function usePayrunAction(payrunId: string) {
  const queryClient = useQueryClient();

  return useMutation<Payrun & { queued?: number }, Error, 'compute' | 'validate' | 'mark-paid' | 'send-payslips'>({
    mutationFn: (action) => postData(`/payroll/payruns/${payrunId}/${action}`),
    onSuccess: (data, action) => {
      void queryClient.invalidateQueries({ queryKey: ['payroll'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });

      const messages: Record<string, string> = {
        compute: 'Payslips computed.',
        validate: 'Payrun validated.',
        'mark-paid': 'Payrun marked as paid.',
        'send-payslips': `${data?.queued ?? 0} payslip(s) queued for delivery.`,
      };
      toast.success(messages[action]);
    },
    onError: (error) => {
      const normalised = normaliseError(error);
      if (normalised.code === 'BLOCKING_WARNINGS') {
        const blockers = (normalised as unknown as { fieldErrors: unknown }) && error;
        void blockers;
        toast.error('Resolve the blocking warnings before validating.');
        return;
      }
      toast.error(normalised.message);
    },
  });
}

export function usePayslips(params: { payrunId?: string; employeeId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: keys.payslips(params),
    queryFn: () => getList<Payslip>('/payroll/payslips', { params: clean(params) }),
  });
}

export function usePayslip(id: string | undefined) {
  return useQuery({
    queryKey: keys.payslip(id ?? ''),
    queryFn: () => getData<Payslip>(`/payroll/payslips/${id}`),
    enabled: Boolean(id),
  });
}

export function usePayslipExplanation(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: keys.payslipExplain(id ?? ''),
    queryFn: () => getData<{ summary: string; steps: string[] }>(`/payroll/payslips/${id}/explain`),
    enabled: Boolean(id) && enabled,
  });
}

export function useRecomputePayslip() {
  return useApiMutation((id: string) => postData<Payslip>(`/payroll/payslips/${id}/recompute`), {
    invalidate: [['payroll']],
    successMessage: 'Payslip recomputed.',
  });
}

/* ---------------------------------------------------------------- dashboard */

function useDashboardWidget<T>(widget: string, filters: Record<string, unknown>) {
  return useQuery({
    queryKey: keys.dashboard(widget, filters),
    queryFn: () => getData<T>(`/dashboard/${widget}`, { params: clean(filters) }),
    staleTime: 60_000,
  });
}

export const useDashboardKpis = (f: Record<string, unknown>) =>
  useDashboardWidget<DashboardKpis>('kpis', f);
export const useSalaryCostByDepartment = (f: Record<string, unknown>) =>
  useDashboardWidget<{ department: string; totalCost: number }[]>('salary-cost-by-department', f);
export const useMonthlyNetSalaryTrend = (f: Record<string, unknown>) =>
  useDashboardWidget<{ month: string; netTotal: number }[]>('monthly-net-salary-trend', f);
export const usePayslipStatusBreakdown = (f: Record<string, unknown>) =>
  useDashboardWidget<{ status: string; count: number }[]>('payslip-status-breakdown', f);
export const useDashboardAlerts = () => useDashboardWidget<DashboardAlerts>('alerts', {});
export const useAttendanceOverview = (f: Record<string, unknown>) =>
  useDashboardWidget<AttendanceOverview>('attendance-overview', f);
export const useTimeOffOverview = (f: Record<string, unknown>) =>
  useDashboardWidget<TimeOffOverview>('time-off-overview', f);
export const useDepartmentOverview = () =>
  useDashboardWidget<DepartmentOverviewRow[]>('department-overview', {});

/** Drops empty params so they never reach the API as `?status=`. */
function clean<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  ) as Partial<T>;
}

export type { Paginated, BlockingWarning };
