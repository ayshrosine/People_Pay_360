# 06 · Attendance & Time off

Two records of the same fact: **who was at work**. Payroll reads both.

In the UI they share one module, *Time & Attendance* (`/time-off`), because
splitting them would separate two halves of one question.

---

## The files

| File | Purpose |
|---|---|
| `src/attendance/attendance.controller.ts` | Attendance routes |
| `src/attendance/attendance.service.ts` | Check in/out, status detection, manual edits |
| `src/attendance/dto/check-in.dto.ts` | Optional `employeeId` (defaults to you) |
| `src/attendance/dto/create-attendance.dto.ts` | A whole record, for HR |
| `src/attendance/dto/update-attendance.dto.ts` | A correction |
| `src/time-off/types/*` | Kinds of leave |
| `src/time-off/allocations/*` | Balances |
| `src/time-off/requests/*` | Asking for leave, and deciding it |

---

## Attendance

| Method | Path | Does |
|---|---|---|
| `GET` | `/attendance` | List, filtered by employee, date range, status |
| `GET` | `/attendance/widget/today` | Your open record, for the floating widget |
| `POST` | `/attendance/check-in` | Start a day |
| `POST` | `/attendance/:id/check-out` | End it |
| `PATCH` | `/attendance/:id` | HR correction |

### Check in

Creates a record with `checkIn: now` and no `checkOut`. `employeeId` defaults to
the caller, so an employee checks themselves in and HR can check in someone else.

### Check out — where the status is decided

```ts
const workedHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);

let status = attendance.status;
const schedule = await this.scheduleOn(attendance.employeeId, checkIn);

if (schedule) {
  const rosteredDays = schedule.lines.length || 5;
  const expectedHours = schedule.totalWeeklyHours / rosteredDays;

  if (workedHours > expectedHours * 1.2) status = AttendanceStatus.OVERTIME;
  else if (workedHours < expectedHours * 0.8) status = AttendanceStatus.LATE;
}

if (workedHours > 16) status = AttendanceStatus.MISSING_CHECKOUT;
```

Three things worth noticing:

**The schedule comes from the contract**, via `scheduleOn(employeeId, date)` —
the roster that applied *on that day*, not the one that applies today.

**`schedule.lines.length || 5`** — the real number of rostered days. Assuming
five would misjudge a four-day part-time roster in both directions.

**Over 16 hours means somebody forgot to check out**, not a heroic shift. It is
flagged as `MISSING_CHECKOUT` for a human to correct.

### Corrections leave a trace

```ts
data: { ...dto, isManualEdit: true, editedById, status: MANUALLY_EDITED }
```

An edited record says so and records who edited it. Attendance feeds payroll, so
it is an audit trail, not just data.

### The widget

`GET /attendance/widget/today` returns your open record — or `null` if you have
not checked in.

> `null` must arrive as `{ "data": null }`. Returning a bare `null` produced an
> **empty body**, which the client read as `undefined`, which TanStack Query
> rejects outright. The transform interceptor now wraps it.

---

## Time off, in three parts

**Types** define kinds of leave. **Allocations** grant balances. **Requests**
draw from those balances.

### Types

| Flag | Effect |
|---|---|
| `requiresAllocation` | Must have a balance to draw from |
| `requiresApproval` | Needs a decision |
| `affectsPayroll` | **If false, the leave still earns salary** |

`affectsPayroll: false` is how paid leave works: the payslip computation counts
those days as worked.

### Allocations

`allocated`, `taken`, `remaining`, valid between two dates.

> **`remaining` is never client-supplied.** It is `allocated − taken`, computed
> server-side. If the client could send it, an employee could grant themselves
> leave by editing a number.

### Requests

| Method | Path | Does |
|---|---|---|
| `GET` | `/time-off/requests` | List, **scoped to what you may see** |
| `POST` | `/time-off/requests` | Ask for leave |
| `PATCH` | `/time-off/requests/:id/approve` | Approve |
| `PATCH` | `/time-off/requests/:id/refuse` | Refuse |

#### Creating checks the balance first

```ts
if (Number(allocation.remaining) < dto.duration) {
  throw new BadRequestException({
    message: `Insufficient balance. Available: ${allocation.remaining}, requested: ${dto.duration}.`,
    code: 'INSUFFICIENT_BALANCE',
  });
}
```

The message names both numbers, so the UI can show something useful rather than
"request failed".

#### Approving is one transaction

This is the most important few lines in the module.

```ts
return this.prisma.$transaction(async (tx) => {
  const updated = await tx.timeOffRequest.update({
    where: { id },
    data: { status: 'APPROVED', approvedById, approvedAt: new Date() },
  });

  if (allocationId) {
    await tx.timeOffAllocation.update({
      where: { id: allocationId },
      data: {
        taken:     { increment: request.duration },
        remaining: { decrement: request.duration },
      },
    });
  }

  return updated;
});
```

> **Why a transaction:** approving the request and debiting the balance are one
> fact. If the first succeeded and the second failed, the employee would have
> approved leave that never came out of their balance — and they could take it
> again. `$transaction` means both happen or neither does.

`increment` / `decrement` also matter: they are computed **by the database**, so
two simultaneous approvals cannot both read `10` and both write `9`.

#### Only pending requests can be decided

```ts
if (request.status !== TimeOffRequestStatus.TO_APPROVE) {
  throw new BadRequestException({
    message: `A request in status ${request.status} cannot be approved.`,
    code: 'INVALID_REQUEST_STATE',
  });
}
```

Without this, approving twice would debit the balance twice.

#### Who may decide

```ts
async assertMayDecide(id: string, user: RequestUser | undefined | null): Promise<void> {
  if (user && HR_ROLES.includes(user.role)) return;

  const request = await this.prisma.timeOffRequest.findUnique({
    where: { id }, select: { employeeId: true },
  });
  if (!request) throw new NotFoundException({ … });

  await this.departmentHeads.assertLeads(user, request.employeeId);
}
```

HR always may. A **department head** may, for their own department, never for
another and never for themselves. See [04](04-EMPLOYEES-DEPARTMENTS.md).

#### Listings are scoped

| Caller | Sees |
|---|---|
| HR roles / admin | Every request |
| Department head | Their department, plus their own |
| Everyone else | Only their own |

> Before this, any employee could list every colleague's leave — the permission
> check passed and nothing narrowed the rows.

---

## How this reaches payroll

```ts
const attendedDays = new Set(attendances.map((a) => a.checkIn.toISOString().slice(0, 10)));

const paidLeaveDays = approvedLeave
  .filter((request) => !request.timeOffType.affectsPayroll)
  .reduce((sum, request) => sum + request.duration, 0);

const workedDays = Math.min(totalDays, attendedDays.size + paidLeaveDays);
```

**Worked days = distinct attended days + approved paid-leave days.** A `Set`
deduplicates, so two check-ins on one day still count once. Paid leave counts as
worked; unpaid leave does not.

That number is then divided by the days the contract's schedule rosters. See
[07 · Payroll](07-PAYROLL.md).
