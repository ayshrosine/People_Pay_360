# 01 · Database

**One file defines everything:** [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma).

Prisma reads that file and generates a fully typed client. If a table, column,
or relationship is not in there, it does not exist. Never write SQL to change
the shape of the database — change the schema and push it.

```bash
cd backend
npx prisma generate          # regenerate the typed client after any edit
npx prisma db push           # apply the schema to Neon
npx prisma studio            # browse the data in a GUI
```

> **This project uses `db push`, not migrations.** There is no
> `_prisma_migrations` table, so `prisma migrate deploy` has nothing to run.

---

## The shape, in one picture

```
User ─────────── Employee ───┬── Contract ──── SalaryStructure ──── SalaryRule
 (login)          (person)   │   (terms)         (rule list)         (one rule)
                             │        └──────── WorkingSchedule ─── WorkingScheduleLine
                             │                    (roster)            (one day)
                             ├── Attendance          (a day at work)
                             ├── TimeOffRequest ──── TimeOffType
                             ├── TimeOffAllocation ─ TimeOffType
                             └── Payslip ─────────── PayslipLine
                                    │
Department ───(head)──────────┘     └────────────── Payrun
```

Read it as: a **User** signs in and may be linked to an **Employee**. An
employee has **Contracts**; the contract carries the wage, the salary structure
and the working schedule. Attendance and time off record what actually happened.
Payroll reads all of it and produces **Payslips**.

---

## Every model

### `User` — a login

| Column | Type | Notes |
|---|---|---|
| `email` | String, unique | Used to sign in |
| `passwordHash` | String | argon2. **Never** returned by the API |
| `role` | `RoleName` | Decides permissions |
| `employeeId` | String?, unique | Optional link to a person |
| `isActive` | Boolean | A deactivated account cannot sign in |

A user is **not** an employee. An administrator can be a login with no employee
record at all. That is why `employeeId` is optional, and why self-service
scoping has to handle its absence.

### `Department` — a team

| Column | Notes |
|---|---|
| `name` | "Engineering" |
| `headId` | The employee who **leads** it, unique |

`headId` is the whole department-head feature. The person it points at can
approve leave for that department — see [04](04-EMPLOYEES-DEPARTMENTS.md).

### `Employee` — a person

Identity (`name`, `workEmail`, `jobPosition`, `phone`, `avatarUrl`), placement
(`departmentId`, `managerId`), employment status, and payment details
(`bankAccount`, `bankIfsc`).

`managerId` points at another `Employee` — a self-relation named
`ManagerReports`, which is why `reports` exists on the other side.

> **The employee has no working schedule.** That moved to the contract. A
> schedule is a term of employment: someone who switches to part time in July
> must still be judged against the full-time roster for June, and a field on the
> person can only ever describe *today*.

### `WorkingSchedule` + `WorkingScheduleLine` — a roster

The schedule is the header ("Standard 40 Hours/Week"); each **line** is one
rostered day.

```prisma
dayOfWeek    Int      // 0 = Monday .. 6 = Sunday
startTime    String   // "09:00"
endTime      String   // "18:00"
breakMinutes Int
```

> **Careful:** `dayOfWeek` is 0 = Monday, but JavaScript's `Date#getDay()` is
> 0 = Sunday. Code that crosses between the two rotates with `(getDay() + 6) % 7`.

`totalWeeklyHours` is computed from the lines when a schedule is saved, never
typed in by hand.

### `Contract` — terms of employment

| Column | Why it matters |
|---|---|
| `startDate` / `endDate` | `endDate: null` means open-ended |
| `wage` | `Decimal(12,2)` — money is never a float |
| `salaryStructureId` | Which rules compute this person's pay |
| `workingScheduleId` | Which days they are rostered |
| `status` | `DRAFT` / `RUNNING` / `EXPIRED` / `CANCELLED` |

**The rule that matters:** an employee may have only **one `RUNNING` contract
covering any given date**. Payroll must be able to ask "which contract applied
on 12 June?" and get exactly one answer.

This is enforced twice — in the service, and in the database:

```sql
-- backend/prisma/sql/001_no_overlapping_running_contracts.sql
ALTER TABLE "Contract" ADD CONSTRAINT no_overlapping_running_contracts
  EXCLUDE USING gist (
    "employeeId" WITH =,
    daterange("startDate"::date, COALESCE("endDate"::date, 'infinity'::date), '[]') WITH &&
  ) WHERE (status = 'RUNNING');
```

The service returns a friendly `409 OVERLAPPING_CONTRACT`; the constraint is the
guarantee underneath, for anything that bypasses the service.

### `Attendance` — a day at work

`checkIn`, optional `checkOut`, computed `workedHours`, and a `status`
(`PRESENT`, `LATE`, `ABSENT`, `OVERTIME`, `MISSING_CHECKOUT`,
`MANUALLY_EDITED`). `isManualEdit` and `editedById` record that a human changed
it — an audit trail.

### `TimeOffType` — a kind of leave

"Annual leave", "Sick leave". Three flags drive real behaviour:

| Flag | Effect |
|---|---|
| `requiresAllocation` | Must have a balance to draw from |
| `requiresApproval` | Needs a decision, versus auto-approved |
| `affectsPayroll` | **If false, the leave still earns salary** |

That last one is read by the payslip computation: paid leave counts towards
worked days, unpaid leave does not.

### `TimeOffAllocation` — a balance

`allocated`, `taken`, `remaining`, valid between two dates.

> `remaining` is **derived server-side** — `allocated − taken`. The client never
> sends it. Approving a request debits the allocation in the same transaction
> that updates the request, so the two can never disagree.

### `TimeOffRequest` — asking for leave

`startDate`, `endDate`, `duration`, `status`, `reason`, and who approved it.

### `SalaryStructure` + `SalaryRule` — how pay is computed

A structure is an **ordered list of rules**. Each rule:

| Column | Meaning |
|---|---|
| `code` | `BASIC`, `HRA`, `PF`, `GROSS`, `NET` — how later rules refer to it |
| `category` | `BASIC` / `ALLOWANCE` / `DEDUCTION` / `GROSS` / `NET` |
| `sequence` | The order they run in. **Order is everything** |
| `computationType` | `FIXED`, `PERCENTAGE`, or `FORMULA` |
| `amount` | For `FIXED` |
| `percentageOf` + `percentageValue` | For `PERCENTAGE` — "40% of `BASIC`" |
| `formula` | For `FORMULA` — e.g. `GROSS - PF` |
| `condition` | Optional guard: the rule only runs if this is true |

Full explanation in [07 · Payroll](07-PAYROLL.md).

### `Payrun` — one payroll cycle

A name, a period, a salary structure, a status, and its payslips. The status
moves `DRAFT → COMPUTING → COMPUTED → VALIDATED → PAID` and never backwards.

### `Payslip` + `PayslipLine` — the result

| Column | Notes |
|---|---|
| `contractId` | The contract that applied **during that period** |
| `workedDays` | What the pro-rating used |
| `grossAmount`, `netAmount` | `Decimal(12,2)` |
| `warnings` | JSON — blocking problems found at compute time |
| `pdfUrl` | The R2 object key, once a PDF exists |

`@@unique([payrunId, employeeId])` — one payslip per person per payrun, enforced
by the database rather than by hoping.

**`PayslipLine` is the important part.** Every rule result is stored as its own
row: code, label, category, amount, sequence. That is what makes a payslip a
*snapshot*: editing a salary rule next month cannot change what someone was
already paid.

---

## The enums

| Enum | Values |
|---|---|
| `RoleName` | `EMPLOYEE`, `HR_MANAGER`, `HR_PAYROLL_USER`, `HR_PAYROLL_MANAGER`, `ADMIN` |
| `EmployeeStatus` | `ACTIVE`, `INACTIVE`, `ON_LEAVE`, `TERMINATED` |
| `ContractStatus` | `DRAFT`, `RUNNING`, `EXPIRED`, `CANCELLED` |
| `AttendanceStatus` | `PRESENT`, `LATE`, `ABSENT`, `OVERTIME`, `MISSING_CHECKOUT`, `MANUALLY_EDITED` |
| `TimeOffRequestStatus` | `TO_APPROVE`, `APPROVED`, `REFUSED`, `CANCELLED` |
| `PayrunStatus` | `DRAFT`, `COMPUTING`, `COMPUTED`, `VALIDATED`, `PAID`, `ERROR` |
| `PayslipStatus` | `DRAFT`, `COMPUTED`, `WAITING`, `VALIDATED`, `PAID`, `ERROR` |
| `SalaryCategory` | `BASIC`, `ALLOWANCE`, `GROSS`, `DEDUCTION`, `NET` |
| `ComputationType` | `FIXED`, `PERCENTAGE`, `FORMULA`, `PYTHON_LIKE` |

Enums are enforced by Postgres, so an invalid status cannot be stored at all.

---

## Two rules to remember

**Money is `Decimal`, never `Float`.** `0.1 + 0.2 !== 0.3` in floating point,
and payroll cannot be approximately right. Prisma returns `Decimal` objects, so
code calls `Number(contract.wage)` when it needs arithmetic.

**Deleting is restricted by default.** You cannot delete an employee who has
payslips — the foreign key refuses. The service turns that into a clear
`409 EMPLOYEE_HAS_RECORDS` and tells you to archive instead. Payroll records are
legal documents.
