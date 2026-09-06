'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  CalendarClock,
  FileText,
  Palmtree,
  Receipt,
  Save,
  Wallet,
  Trash2,
} from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import {
  Avatar,
  Card,
  CardHeader,
  Field,
  Input,
  SectionRule,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/data-table';
import { StatusChip } from '@/components/ui/status';
import { EmployeeTimeline } from '@/components/employees/employee-timeline';
import { DepartmentLeadership } from '@/components/employees/department-leadership';
import {
  useContracts,
  useDeleteEmployee,
  useDepartments,
  useEmployee,
  useEmployees,
  useSaveEmployee,
  useTimeOffRequests,
  useAllocations,
  usePayslips,
  useAttendance,
} from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import { normaliseError } from '@/lib/api/client';
import type { Employee } from '@/lib/api/types';

const STATUSES: Employee['status'][] = ['ACTIVE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED'];
const TYPES = ['Full-time', 'Part-time', 'Contract', 'Intern'];

interface FormState {
  name: string;
  workEmail: string;
  jobPosition: string;
  departmentId: string;
  managerId: string;
  status: Employee['status'];
  employeeType: string;
  phone: string;
  bankAccount: string;
  bankIfsc: string;
}

const EMPTY: FormState = {
  name: '',
  workEmail: '',
  jobPosition: '',
  departmentId: '',
  managerId: '',
  status: 'ACTIVE',
  employeeType: 'Full-time',
  phone: '',
  bankAccount: '',
  bankIfsc: '',
};

function toFormState(record: Employee): FormState {
  return {
    name: record.name ?? '',
    workEmail: record.workEmail ?? '',
    jobPosition: record.jobPosition ?? '',
    departmentId: record.departmentId ?? '',
    managerId: record.managerId ?? '',
    status: record.status,
    employeeType: record.employeeType ?? '',
    phone: record.phone ?? '',
    bankAccount: record.bankAccount ?? '',
    bankIfsc: record.bankIfsc ?? '',
  };
}

/**
 * Waits for the record, then mounts the form keyed on it. Remounting on a new
 * record is what resets the fields - no effect mirrors server data into state.
 */
export default function EmployeeFormPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const employee = useEmployee(id);

  if (id !== 'new' && employee.isLoading) {
    return (
      <PageShell title={<Skeleton className="h-6 w-52" />}>
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-64" />
        </div>
      </PageShell>
    );
  }

  return <EmployeeForm key={employee.data?.id ?? id} />;
}

function EmployeeForm() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();

  const id = params.id;
  const isNew = id === 'new';

  const employee = useEmployee(id);
  const departments = useDepartments();
  const colleagues = useEmployees({ limit: 200 });

  const save = useSaveEmployee();
  const remove = useDeleteEmployee();

  // Initialised at mount from the loaded record rather than synced in an
  // effect; the page below remounts this form via `key` when the record
  // arrives or the id changes, so there is never a stale-form render.
  const [form, setForm] = React.useState<FormState>(() =>
    employee.data ? toFormState(employee.data) : EMPTY,
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [banner, setBanner] = React.useState<string | null>(null);

  const editable = can(isNew ? 'create' : 'update', 'Employee');

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setBanner(null);

    const payload = {
      ...(isNew ? {} : { id }),
      name: form.name.trim(),
      workEmail: form.workEmail.trim(),
      // Empty strings would fail validation; omit optional fields instead.
      jobPosition: form.jobPosition.trim() || undefined,
      departmentId: form.departmentId || undefined,
      managerId: form.managerId || undefined,
      status: form.status,
      employeeType: form.employeeType || undefined,
      phone: form.phone.trim() || undefined,
      bankAccount: form.bankAccount.trim() || undefined,
      bankIfsc: form.bankIfsc.trim() || undefined,
    };

    try {
      const saved = await save.mutateAsync(payload);
      if (isNew && saved?.id) router.replace(`/employees/${saved.id}`);
    } catch (error) {
      const normalised = normaliseError(error);
      setErrors(normalised.fieldErrors);
      setBanner(
        normalised.code === 'EMAIL_ALREADY_EXISTS'
          ? 'Another employee already uses this work email.'
          : normalised.message,
      );
    }
  }

  return (
    <PageShell
      breadcrumbs={[{ label: 'Employees', href: '/employees' }, { label: isNew ? 'New' : form.name }]}
      title={
        <span className="flex items-center gap-3">
          <Avatar name={form.name || 'New'} src={employee.data?.avatarUrl} size={36} />
          <span>{form.name || 'New employee'}</span>
          {!isNew ? <StatusChip status={form.status} /> : null}
        </span>
      }
      description={form.jobPosition || undefined}
      actions={
        <>
          {!isNew && can('delete', 'Employee') ? (
            <Button
              variant="danger"
              onClick={async () => {
                if (!window.confirm(`Remove ${form.name}? This cannot be undone.`)) return;
                await remove.mutateAsync(id);
                router.push('/employees');
              }}
              loading={remove.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </Button>
          ) : null}
          {editable ? (
            <Button variant="primary" form="employee-form" type="submit" loading={save.isPending}>
              <Save className="h-3.5 w-3.5" aria-hidden />
              Save
            </Button>
          ) : null}
        </>
      }
    >
      {!isNew ? <SmartButtons employeeId={id} /> : null}

      <Tabs defaultValue="details" className="mt-4">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          {!isNew ? <TabsTrigger value="timeline">Timeline</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="details" className="pt-4">
          <form id="employee-form" onSubmit={handleSubmit} noValidate>
            <fieldset disabled={!editable} className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Work information" description="Drives payroll and scheduling" />
                <div className="space-y-4 p-4">
                  <Field label="Full name" htmlFor="name" error={errors.name}>
                    <Input
                      id="name"
                      required
                      value={form.name}
                      invalid={Boolean(errors.name)}
                      onChange={(event) => set('name', event.target.value)}
                    />
                  </Field>

                  <Field label="Work email" htmlFor="workEmail" error={errors.workEmail}>
                    <Input
                      id="workEmail"
                      type="email"
                      required
                      value={form.workEmail}
                      invalid={Boolean(errors.workEmail)}
                      onChange={(event) => set('workEmail', event.target.value)}
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Job position" htmlFor="jobPosition">
                      <Input
                        id="jobPosition"
                        value={form.jobPosition}
                        onChange={(event) => set('jobPosition', event.target.value)}
                      />
                    </Field>

                    <Field label="Employee type" htmlFor="employeeType">
                      <Select
                        id="employeeType"
                        value={form.employeeType}
                        onChange={(event) => set('employeeType', event.target.value)}
                      >
                        <option value="">Not set</option>
                        {TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Department" htmlFor="departmentId">
                      <Select
                        id="departmentId"
                        value={form.departmentId}
                        onChange={(event) => set('departmentId', event.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {departments.data?.data.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field label="Manager" htmlFor="managerId">
                      <Select
                        id="managerId"
                        value={form.managerId}
                        onChange={(event) => set('managerId', event.target.value)}
                      >
                        <option value="">No manager</option>
                        {colleagues.data?.data
                          .filter((candidate) => candidate.id !== id)
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </option>
                          ))}
                      </Select>
                    </Field>
                  </div>

                  <Field label="Status" htmlFor="status">
                    <Select
                      id="status"
                      value={form.status}
                      onChange={(event) => set('status', event.target.value as Employee['status'])}
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status.replace('_', ' ')}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </Card>

              <Card className="self-start">
                <CardHeader
                  title="Personal & banking"
                  description="Missing bank details block payrun validation"
                />
                <div className="space-y-4 p-4">
                  <Field label="Phone" htmlFor="phone">
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(event) => set('phone', event.target.value)}
                    />
                  </Field>

                  <SectionRule label="Payout" />

                  <Field
                    label="Bank account"
                    htmlFor="bankAccount"
                    hint={
                      !form.bankAccount
                        ? 'Without this, every payslip for this employee raises a blocking warning.'
                        : undefined
                    }
                  >
                    <Input
                      id="bankAccount"
                      className="font-mono"
                      value={form.bankAccount}
                      onChange={(event) => set('bankAccount', event.target.value)}
                    />
                  </Field>

                  <Field label="IFSC" htmlFor="bankIfsc">
                    <Input
                      id="bankIfsc"
                      className="font-mono uppercase"
                      value={form.bankIfsc}
                      onChange={(event) => set('bankIfsc', event.target.value)}
                    />
                  </Field>
                </div>
              </Card>
            </fieldset>

            {/* Outside the fieldset: appointing a head is its own action, not
                part of the employee form, and must stay enabled while the form
                is read-only. */}
            {!isNew ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <DepartmentLeadership
                  employeeId={id}
                  employeeName={form.name}
                  departmentId={form.departmentId || null}
                />
              </div>
            ) : null}

            {banner ? (
              <div
                role="alert"
                className="mt-4 rounded-[var(--radius-ctl)] border border-[var(--status-danger)] bg-[var(--status-danger-bg)] px-3 py-2 text-[12px] text-[var(--status-danger)]"
              >
                {banner}
              </div>
            ) : null}
          </form>
        </TabsContent>

        {!isNew ? (
          <TabsContent value="timeline" className="pt-4">
            <EmployeeTimeline employeeId={id} />
          </TabsContent>
        ) : null}
      </Tabs>
    </PageShell>
  );
}

/**
 * Smart buttons: each opens the target module already filtered to this
 * employee, never a fresh unfiltered screen. The count is the point - it tells
 * you whether opening it is worth the click.
 */
function SmartButtons({ employeeId }: { employeeId: string }) {
  const contracts = useContracts({ employeeId });
  const attendance = useAttendance({ employeeId });
  const requests = useTimeOffRequests({ employeeId });
  const allocations = useAllocations({ employeeId });
  const payslips = usePayslips({ employeeId });

  const buttons = [
    {
      href: `/contracts?employeeId=${employeeId}`,
      label: 'Contracts',
      icon: FileText,
      count: contracts.data?.data.length,
      loading: contracts.isLoading,
    },
    {
      href: `/time-off/attendance?employeeId=${employeeId}`,
      label: 'Attendance',
      icon: CalendarClock,
      count: attendance.data?.data.length,
      loading: attendance.isLoading,
    },
    {
      href: `/time-off/requests?employeeId=${employeeId}`,
      label: 'Time off',
      icon: Palmtree,
      count: requests.data?.data.length,
      loading: requests.isLoading,
    },
    {
      href: `/time-off/allocations?employeeId=${employeeId}`,
      label: 'Allocations',
      icon: Wallet,
      count: allocations.data?.data.length,
      loading: allocations.isLoading,
    },
    {
      href: `/payroll/payslips?employeeId=${employeeId}`,
      label: 'Payslips',
      icon: Receipt,
      // A real count, like every other button: "the count is the point".
      count: payslips.data?.data.length,
      loading: payslips.isLoading,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {buttons.map((button) => (
        <Link
          key={button.href}
          href={button.href}
          className="group flex items-center gap-2.5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2.5 transition-[border-color,background-color] duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
        >
          <button.icon
            className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent)]"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {button.label}
            </p>
            <p className="ledger-num text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
              {button.loading ? '—' : (button.count ?? 'Open')}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
