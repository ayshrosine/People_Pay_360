# PeoplePay360

HR and payroll operations in one place: employees, contracts, working schedules,
attendance, time off, and a payroll engine where **salary rules actually drive
payslip computation**.

```
people_pay/
├── backend/    NestJS + Prisma + Neon Postgres   → http://localhost:4000/api/v1
├── frontend/   Next.js 16 + Tailwind v4          → http://localhost:3000
└── specs/      Product spec, mockups, project status, and the rules that matter
```

**Start here:** [`specs/IMPORTANT.md`](specs/IMPORTANT.md) — the invariants that
keep payroll trustworthy. [`specs/PROJECT_STATUS.md`](specs/PROJECT_STATUS.md) —
what works today, verified against the live database.

---

## Running it

Both halves need to be running. Start the API first — the web app is a client of it.

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # fill in DATABASE_URL and the two JWT secrets
npx prisma generate
npx prisma db push        # creates the schema on Neon
npm run prisma:seed       # base users, employees, salary structure
npm run seed:demo         # representative data: staff, attendance, leave
npm run seed:heads        # appoints a head for each department
npm run start:dev
```

Only three variables are required: `DATABASE_URL`, `JWT_ACCESS_SECRET` and
`JWT_REFRESH_SECRET` (16+ characters each). Redis, Cloudflare R2, Resend and
Sentry are **optional** — the app boots and works without them, and each
feature degrades explicitly rather than crashing at startup.

Once running:

- API — `http://localhost:4000/api/v1`
- Swagger UI — `http://localhost:4000/api/docs`
- OpenAPI JSON — `http://localhost:4000/api/docs-json`

Then create some payruns through the real API, so every payslip figure comes
from the rule engine rather than a fixture:

```bash
npm run payruns:demo
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL points at the API
npm run dev
```

### Demo accounts

| Email | Role | Password |
|---|---|---|
| `admin@peoplepay360.com` | Administrator | `password123` |
| `hrpayroll@peoplepay360.com` | HR Payroll User | `password123` |
| `john.doe@peoplepay360.com` | Employee **and head of Engineering** | `password123` |

Roles change what you see: an administrator lands on the payroll dashboard, an
employee lands on their own attendance and can only ever read their own records.

Sign in as John Doe to see the department-head case: an ordinary `EMPLOYEE` who
is still denied the dashboard, payruns and employee management, but who can
approve leave for Engineering because `Department.headId` points at him.

---

## The modules

| Module | Route | What it does |
|---|---|---|
| Dashboard | `/dashboard` | Live payroll KPIs, salary cost by department, net-salary trend, alerts |
| Employees | `/employees` | Directory (kanban or list), full employee record |
| Contracts | `/contracts` | Employment terms, wage, salary structure, period |
| Time & Attendance | `/time-off` | Attendance, leave requests, allocations, leave types |
| Working schedules | `/working-schedules` | Rostered days and hours, which drive pro-rating |
| Payroll | `/payroll` | Payruns, payslips, salary structures and rules |
| Users | `/admin/users` | Accounts and roles |

Each department can have a **head**: an ordinary employee who may approve and
refuse leave for their own department. Appoint one from any employee's page,
under *Department leadership*.

**Attendance sits inside Time & Attendance** rather than in a module of its own:
leave and attendance are two answers to the same question — who was at work —
and payroll reads both to decide what a period is worth.

---

## Infrastructure

| Concern | Service | Notes |
|---|---|---|
| Database | **Neon** (serverless Postgres) | Pooled `postgresql://` endpoint. Schema applied with `prisma db push`, so there is no migration history table. |
| ORM | **Prisma** | `backend/prisma/schema.prisma` is the single source of truth. |
| Object storage | **Cloudflare R2** | S3-compatible, via `@aws-sdk/client-s3` with `region: 'auto'`. Optional — payslip PDFs stream inline when R2 is not configured. |
| Queue | Redis + BullMQ | Optional. Payslip computation runs inline when `REDIS_URL` is absent. |
| Errors | Sentry | Optional. No-ops without a DSN. |

### The contract-overlap constraint

Payroll must be able to answer "which contract applied on this date" with
exactly one row. Apply the exclusion constraint once against Neon:

```bash
psql "$DATABASE_URL" -f backend/prisma/sql/001_no_overlapping_running_contracts.sql
```

The service also checks for overlaps in application code and returns
`409 OVERLAPPING_CONTRACT`; the constraint is the guarantee underneath it.

---

## How payroll actually computes

This is the part worth understanding, because it is what separates the app from
a CRUD form over a payslip table.

1. **A salary structure is an ordered list of rules.** Each rule has a `code`, a
   `category` (BASIC / ALLOWANCE / DEDUCTION / GROSS / NET), a `sequence`, and a
   computation type — a fixed amount, a percentage of an earlier rule, or a
   formula.
2. **The rule engine runs them in sequence**, writing every result into a shared
   context keyed by rule code, so a later rule can reference an earlier one
   (`GROSS - PF`). Formulas are evaluated by a hardened mathjs instance — never
   `eval` — with runtime extension points disabled and a token blocklist.
3. **Every result is persisted as a `PayslipLine`.** A payslip is a *snapshot*,
   not a live view: editing a salary rule next month cannot retroactively change
   what someone was already paid.
4. **The payrun state machine is guarded end to end**:
   `DRAFT → COMPUTING → COMPUTED → VALIDATED → PAID`. Validation is blocked
   while any payslip carries a blocking warning (missing bank details, no active
   contract), and a `PAID` payrun is immutable.

Worked example on a ₹50,000 monthly contract, for a full month worked:

| Seq | Rule | Computation | Amount |
|---|---|---|---|
| 1 | Basic Salary | `basicWage * (workedDays / totalDays)` | 50,000.00 |
| 2 | House Rent Allowance | 40% of BASIC | 20,000.00 |
| 3 | Provident Fund | 12% of BASIC | −6,000.00 |
| 4 | Gross Salary | `BASIC + HRA` | 70,000.00 |
| 5 | Net Salary | `GROSS - PF` | **64,000.00** |

`totalDays` is the number of days the employee's working schedule actually
rosters, not calendar days — so perfect attendance pays exactly the contract
wage.

---

## Architecture notes

**Authorisation is enforced twice, and only one of them counts.** The API is the
real boundary: a global `JwtAuthGuard` authenticates, a global `AbilitiesGuard`
checks the CASL policy declared by `@CheckAbility`, and list queries for
self-service roles are additionally scoped to the caller's own `employeeId` —
because "may this role read employees" and "may this role read *this* employee"
are different questions. The frontend mirrors the same policy in
`src/lib/abilities` purely to hide actions a role cannot perform.

**Every response is `{ data, meta? }`.** A single interceptor normalises it, so
the frontend's list and detail hooks were written once against one shape. `null`
is wrapped too — an empty body would reach the client as `undefined`.

**Errors carry a `code`.** `OVERLAPPING_CONTRACT`, `INSUFFICIENT_BALANCE`,
`BLOCKING_WARNINGS`, `PAYRUN_IMMUTABLE` and friends let the UI show a precise
inline message instead of a generic toast.

**Balances are never client-supplied.** Approving leave updates the request and
debits the allocation inside one transaction; `remaining` is derived server-side.

**Some authority is a relationship, not a role.** A department head is an
ordinary `EMPLOYEE` whom `Department.headId` points at. They may approve and
refuse leave for their own department — never for another, and never their own.
The role guard defers via `@AllowDepartmentHead()`, and the handler then decides
per record; the decorator grants nothing by itself.

**Records with history are archived, not deleted.** Deleting an employee who has
payslips, contracts or attendance returns `409 EMPLOYEE_HAS_RECORDS`.

---

## Design system

Dark-first, borders-only depth, one indigo accent. A fixed left rail names the
module you are in; the bar above it carries the breadcrumb, ⌘K search, the theme
toggle and your account. Each page opens with a mono micro-label and a large
display title, so the eye lands in the same place on every screen.

The signature is a **ledger rail**: tabular JetBrains Mono numerals in
hairline-ruled columns, used identically in the KPI strip, every table, and the
payslip breakdown — so a figure looks the same wherever it appears. Status
colour means one thing across all modules (green is settled, whether that is an
approved leave request, a running contract, or a paid payslip).

Tokens live in `frontend/src/app/globals.css`. Light and dark are both defined
as complete palettes; only lightness moves between them.

---

## Checks

```bash
cd backend  && npm run build && npm run lint
cd frontend && npm run typecheck && npm run lint && npm run build
```

End-to-end, against whatever the API is pointed at:

```bash
cd backend && npm run test:all      # everything below, in order

cd backend && npm run test:api      # 50 checks: contract, RBAC, business rules
cd backend && npm run test:heads    # 13 checks: department-head authority
cd backend && npm run test:ui       # browser walkthrough, 3 roles, every page
cd backend && npm run test:head-ui  # the head's approve controls actually render
```

The UI walkthrough fails on console errors, failed API calls and blank pages —
not only on crashes.
