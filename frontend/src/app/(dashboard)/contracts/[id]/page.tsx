'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Save } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Field, Input, Select } from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/data-table';
import { StatusChip } from '@/components/ui/status';
import {
  useContract,
  useEmployees,
  useSaveContract,
  useSalaryStructures,
  useWorkingSchedules,
} from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import { normaliseError } from '@/lib/api/client';
import { toISODate } from '@/lib/utils';
import type { Contract, ContractStatus } from '@/lib/api/types';

const STATUSES: ContractStatus[] = ['DRAFT', 'RUNNING', 'EXPIRED', 'CANCELLED'];

interface FormState {
  employeeId: string;
  jobPosition: string;
  department: string;
  startDate: string;
  endDate: string;
  wage: string;
  wageType: string;
  salaryStructureId: string;
  workingScheduleId: string;
  status: ContractStatus;
}

function toFormState(record: Contract, fallbackEmployeeId: string): FormState {
  return {
    employeeId: record.employeeId ?? fallbackEmployeeId,
    jobPosition: record.jobPosition ?? '',
    department: record.department ?? '',
    startDate: toISODate(record.startDate),
    endDate: record.endDate ? toISODate(record.endDate) : '',
    wage: String(record.wage ?? ''),
    wageType: record.wageType ?? 'Monthly',
    salaryStructureId: record.salaryStructureId ?? '',
    workingScheduleId: record.workingScheduleId ?? '',
    status: record.status,
  };
}

/**
 * Waits for the record, then mounts the form keyed on it, so the fields are
 * initialised once at mount instead of being mirrored in by an effect.
 */
function ContractFormView() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const contract = useContract(id);

  if (id !== 'new' && contract.isLoading) {
    return (
      <PageShell title={<Skeleton className="h-6 w-56" />}>
        <Skeleton className="h-96" />
      </PageShell>
    );
  }

  return <ContractForm key={contract.data?.id ?? id} />;
}

function ContractForm() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useAuth();

  const id = params.id;
  const isNew = id === 'new';
  // When opened from an Employee smart button the employee is fixed.
  const lockedEmployeeId = searchParams.get('employeeId');

  const contract = useContract(id);
  const employees = useEmployees({ limit: 200 });
  const structures = useSalaryStructures();
  const schedules = useWorkingSchedules();
  const save = useSaveContract();

  const [form, setForm] = React.useState<FormState>(() =>
    contract.data
      ? toFormState(contract.data, lockedEmployeeId ?? '')
      : {
          employeeId: lockedEmployeeId ?? '',
          jobPosition: '',
          department: '',
          startDate: toISODate(new Date()),
          endDate: '',
          wage: '',
          wageType: 'Monthly',
          salaryStructureId: '',
          workingScheduleId: '',
          status: 'DRAFT',
        },
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [banner, setBanner] = React.useState<{ tone: 'danger'; message: string } | null>(null);

  const editable = can(isNew ? 'create' : 'update', 'Contract');

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setBanner(null);

    try {
      const saved = await save.mutateAsync({
        ...(isNew ? {} : { id }),
        employeeId: form.employeeId,
        jobPosition: form.jobPosition.trim() || undefined,
        department: form.department.trim() || undefined,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        wage: Number(form.wage),
        wageType: form.wageType,
        salaryStructureId: form.salaryStructureId || undefined,
        workingScheduleId: form.workingScheduleId || undefined,
        status: form.status,
      });

      if (isNew && saved?.id) router.replace(`/contracts/${saved.id}`);
    } catch (error) {
      const normalised = normaliseError(error);
      setErrors(normalised.fieldErrors);
      setBanner({
        tone: 'danger',
        message:
          normalised.code === 'OVERLAPPING_CONTRACT'
            ? 'This employee already has an active contract covering this period. End or cancel the existing contract first.'
            : normalised.message,
      });
    }
  }

  const employeeName =
    employees.data?.data.find((employee) => employee.id === form.employeeId)?.name ??
    contract.data?.employee?.name;

  return (
    <PageShell
      breadcrumbs={[
        { label: 'Contracts', href: '/contracts' },
        { label: isNew ? 'New' : (employeeName ?? 'Contract') },
      ]}
      title={
        <span className="flex items-center gap-3">
          {isNew ? 'New contract' : `Contract · ${employeeName ?? ''}`}
          {!isNew ? <StatusChip status={form.status} /> : null}
        </span>
      }
      actions={
        editable ? (
          <Button variant="primary" form="contract-form" type="submit" loading={save.isPending}>
            <Save className="h-3.5 w-3.5" aria-hidden />
            Save
          </Button>
        ) : null
      }
    >
      <form id="contract-form" onSubmit={handleSubmit} noValidate>
        {banner ? (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-[var(--radius-card)] border border-[var(--status-danger)] bg-[var(--status-danger-bg)] px-3 py-2.5 text-[12px] text-[var(--status-danger)]"
          >
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{banner.message}</span>
          </div>
        ) : null}

        <fieldset disabled={!editable} className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Period & scope" description="Determines which payruns include it" />
            <div className="space-y-4 p-4">
              <Field label="Employee" htmlFor="employeeId" error={errors.employeeId}>
                <Select
                  id="employeeId"
                  required
                  disabled={Boolean(lockedEmployeeId) && isNew}
                  value={form.employeeId}
                  onChange={(event) => set('employeeId', event.target.value)}
                >
                  <option value="">Select an employee</option>
                  {employees.data?.data.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Start date" htmlFor="startDate" error={errors.startDate}>
                  <Input
                    id="startDate"
                    type="date"
                    required
                    value={form.startDate}
                    onChange={(event) => set('startDate', event.target.value)}
                  />
                </Field>

                <Field label="End date" htmlFor="endDate" hint="Leave empty for open-ended">
                  <Input
                    id="endDate"
                    type="date"
                    value={form.endDate}
                    onChange={(event) => set('endDate', event.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Job position" htmlFor="jobPosition">
                  <Input
                    id="jobPosition"
                    value={form.jobPosition}
                    onChange={(event) => set('jobPosition', event.target.value)}
                  />
                </Field>

                <Field label="Department" htmlFor="department">
                  <Input
                    id="department"
                    value={form.department}
                    onChange={(event) => set('department', event.target.value)}
                  />
                </Field>
              </div>

              <Field
                label="Status"
                htmlFor="status"
                hint="Only RUNNING contracts are picked up by payroll, and two may never overlap."
              >
                <Select
                  id="status"
                  value={form.status}
                  onChange={(event) => set('status', event.target.value as ContractStatus)}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="self-start">
            <CardHeader title="Pay & schedule" description="Feeds the salary rule engine" />
            <div className="space-y-4 p-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <Field label="Wage" htmlFor="wage" error={errors.wage}>
                  <Input
                    id="wage"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    className="ledger-num"
                    value={form.wage}
                    invalid={Boolean(errors.wage)}
                    onChange={(event) => set('wage', event.target.value)}
                  />
                </Field>

                <Field label="Wage type" htmlFor="wageType">
                  <Select
                    id="wageType"
                    value={form.wageType}
                    onChange={(event) => set('wageType', event.target.value)}
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Hourly">Hourly</option>
                  </Select>
                </Field>
              </div>

              <Field
                label="Salary structure"
                htmlFor="salaryStructureId"
                hint="The rules that will actually compute this employee's payslip."
              >
                <Select
                  id="salaryStructureId"
                  value={form.salaryStructureId}
                  onChange={(event) => set('salaryStructureId', event.target.value)}
                >
                  <option value="">Not set</option>
                  {structures.data?.data.map((structure) => (
                    <option key={structure.id} value={structure.id}>
                      {structure.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Working schedule" htmlFor="workingScheduleId">
                <Select
                  id="workingScheduleId"
                  value={form.workingScheduleId}
                  onChange={(event) => set('workingScheduleId', event.target.value)}
                >
                  <option value="">Not set</option>
                  {schedules.data?.data.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.name} · {schedule.totalWeeklyHours}h/week
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>
        </fieldset>
      </form>
    </PageShell>
  );
}

export default function ContractFormPage() {
  return (
    <React.Suspense fallback={null}>
      <ContractFormView />
    </React.Suspense>
  );
}
