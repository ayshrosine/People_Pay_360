# 08 · Dashboard

Eight endpoints, each answering one question, each reading **live data**. There
are no static numbers anywhere in this module.

---

## The files

| File | Purpose |
|---|---|
| `src/dashboard/dashboard.controller.ts` | The eight routes |
| `src/dashboard/dashboard.service.ts` | The queries |
| `frontend/src/app/(dashboard)/dashboard/page.tsx` | The screen |
| `frontend/src/components/dashboard/widgets.tsx` | KPI rail, charts, gauge |

---

## The endpoints

| Path | Answers |
|---|---|
| `/dashboard/kpis` | Total net paid, payslips generated, average salary, approved leave days, attendance health |
| `/dashboard/salary-cost-by-department` | Where the money goes |
| `/dashboard/monthly-net-salary-trend` | Net paid per payrun period |
| `/dashboard/payslip-status-breakdown` | How many are draft / computed / paid |
| `/dashboard/alerts` | What needs attention |
| `/dashboard/attendance-overview` | Present, late, absent, overtime, manual edits |
| `/dashboard/time-off-overview` | Approved days and pending approvals |
| `/dashboard/department-overview` | Headcount and committed salary |

All accept the same filters: `period`, `departmentId`, `employeeType`. The
frontend keeps them in one store so every widget moves together.

---

## Alerts

Three things a payroll administrator needs to know before running a payrun:

| Code | Meaning |
|---|---|
| `PAYSLIP_ERROR` | A payslip failed to compute |
| `MISSING_BANK_DETAILS` | An active employee has nowhere to be paid |
| `CONTRACT_ENDING_SOON` | A contract ends within thirty days |

The first two are exactly the conditions that **block payrun validation**, so the
dashboard warns you before you hit the wall.

---

## Performance — the thing to understand here

Neon is a *remote* database. A round-trip from here costs about **290 ms**. That
single fact dominates everything:

> **Query count, not query complexity, is what makes a page slow.**

Three rules follow.

### 1. Never await independent queries in sequence

`getKpis` originally did this:

```ts
const totalNetSalaryPaid = await this.prisma.payslip.aggregate({ … });
const payslipsGenerated  = await this.prisma.payslip.count({ … });
const avgSalaryResult    = await this.prisma.payslip.aggregate({ … });
// …six of them, one after another
```

Six round-trips in a queue: **5.4 seconds** for a response of 149 bytes. None of
them depended on each other, so they now go out together:

```ts
const [totalNetSalaryPaid, payslipsGenerated, avgSalaryResult,
       approvedTimeOffDays, totalAttendance, presentAttendance] = await Promise.all([
  this.prisma.payslip.aggregate({ … }),
  this.prisma.payslip.count({ … }),
  …
]);
```

**5.4 s → 1.5 s.** Same queries, same results; they just stopped waiting in line.

`getAlerts` had the same shape — three unrelated lookups in sequence — and got
the same treatment.

### 2. Never query inside a loop over rows

`getDepartmentOverview` ran one query *per department*:

```ts
departments.map(async (dept) => {
  const employees = await this.prisma.employee.findMany({ where: { departmentId: dept.id } });
  …
});
```

Eight departments meant eight round-trips. One read answers the whole thing:

```ts
const [departments, employees] = await Promise.all([
  this.prisma.department.findMany({ include: { _count: { select: { employees: true } } } }),
  this.prisma.employee.findMany({
    select: { departmentId: true, contracts: { where: { status: 'RUNNING' }, select: { wage: true }, take: 1 } },
  }),
]);

const salaryByDepartment = new Map<string, number>();
for (const employee of employees) {
  const contract = employee.contracts[0];
  if (!employee.departmentId || !contract) continue;
  salaryByDepartment.set(employee.departmentId,
    (salaryByDepartment.get(employee.departmentId) ?? 0) + Number(contract.wage));
}
```

Grouping in memory is free. Another network round-trip is not.

### 3. Ask for only what you render

Every Prisma `include` is another round-trip. `select` the columns you actually
show.

---

## The frontend side

### The KPI rail

Figures render in **tabular JetBrains Mono** inside hairline-ruled columns — the
"ledger rail". Tabular numerals mean every digit is the same width, so numbers
line up when they change. The same treatment appears in every table and on the
payslip breakdown, so a figure looks identical wherever it appears.

### Charts

Recharts, wrapped so they fill their container:

```tsx
<ResponsiveContainer width="100%" height="100%" minHeight={height}>
```

> A fixed `height` inside a stretched grid cell leaves dead space under the
> chart. `height="100%"` with a `minHeight` floor fills the cell instead.

### Two rules these components exist to demonstrate

**Never put a `<div>` inside a `<p>`.** The loading skeleton is a `<div>` and it
sat in a `<p>` label slot, which is invalid HTML and caused a hydration
mismatch. Now the label and the skeleton are siblings:

```tsx
{item?.label ? (
  <p className="…">{item.label}</p>
) : (
  <Skeleton className="h-2.5 w-14" />
)}
```

**Never key a list by a data-derived label.** Keying department cards by name
broke the moment two departments shared one — React warned about duplicate keys
and could omit rows. These strips are fixed-order, so they key by index.

---

## Access

The dashboard is an **HR view**. Every widget needs a permission an `EMPLOYEE`
does not have, so sending one there would show a page of failures.

`homeRouteFor()` in `frontend/src/lib/abilities/index.ts` routes each role to a
useful home:

```ts
export function homeRouteFor(role: RoleName | null | undefined): string {
  if (!role) return '/login';
  return can(role, 'read', 'Dashboard') ? '/dashboard' : '/time-off/attendance';
}
```

…and `(dashboard)/dashboard/layout.tsx` bounces anyone who reaches it directly
via a bookmark.
