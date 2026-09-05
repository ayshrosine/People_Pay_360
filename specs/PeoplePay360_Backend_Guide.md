# PeoplePay360 — Backend Development Guide
**Confirmed Stack:** NestJS (Node.js + TypeScript) · PostgreSQL 16 · Prisma ORM · Redis + BullMQ · CASL (RBAC) · JWT Auth · Cloudflare R2 (storage) · Puppeteer (PDF) · Resend/SES (email) · Sentry (observability)

This guide is written so the backend can be built **independently** of the frontend by an autonomous coding agent (Devin) — every module, entity, endpoint, request/response shape, and business rule is specified. The **API Contract** sections are the source of truth the frontend guide will consume.

---

## 1. Project Setup

```bash
npx @nestjs/cli new peoplepay360-backend
cd peoplepay360-backend
npm i @nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt
npm i @prisma/client prisma
npm i @casl/ability
npm i bullmq ioredis
npm i @aws-sdk/client-s3          # works for Cloudflare R2 (S3-compatible)
npm i puppeteer
npm i resend                       # or @aws-sdk/client-ses
npm i @sentry/node @sentry/profiling-node
npm i class-validator class-transformer
npm i argon2
npm i mathjs                       # sandboxed formula evaluation
npm i @nestjs/swagger swagger-ui-express
npx prisma init
```

### Folder Structure
```
src/
 ├── main.ts
 ├── app.module.ts
 ├── common/
 │    ├── decorators/           (@CurrentUser, @Roles, @CheckAbility)
 │    ├── guards/               (JwtAuthGuard, AbilitiesGuard)
 │    ├── filters/              (AllExceptionsFilter → reports to Sentry)
 │    ├── interceptors/         (LoggingInterceptor, TransformInterceptor)
 │    └── pipes/                (ValidationPipe config)
 ├── config/
 │    ├── sentry.config.ts
 │    ├── redis.config.ts
 │    └── env.validation.ts
 ├── auth/                      (login, refresh, JWT strategy)
 ├── users/                     (User Management screen — admin CRUD of accounts)
 ├── employees/                 (Employee module — Kanban/List/Form)
 ├── departments/
 ├── contracts/
 ├── working-schedules/
 ├── attendance/
 ├── time-off/
 │    ├── requests/
 │    ├── allocations/
 │    └── types/
 ├── payroll/
 │    ├── payruns/
 │    ├── payslips/
 │    ├── salary-structures/
 │    ├── salary-rules/
 │    └── rule-engine/          (the interpreter — see §6)
 ├── dashboard/                 (aggregation/reporting endpoints)
 ├── files/                     (Cloudflare R2 upload/download service)
 ├── jobs/                      (BullMQ processors: compute-payslip, generate-pdf, send-email)
 └── prisma/
      └── prisma.service.ts
```

---

## 2. Environment Variables (`.env`)

```
DATABASE_URL=postgresql://user:pass@localhost:5432/peoplepay360
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
REDIS_URL=redis://localhost:6379

# Cloudflare R2 (S3-compatible)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=peoplepay360-files
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://files.yourdomain.com   # optional custom domain

RESEND_API_KEY=...
EMAIL_FROM=payroll@yourdomain.com

SENTRY_DSN=...
SENTRY_ENVIRONMENT=development
SENTRY_TRACES_SAMPLE_RATE=1.0

CORS_ORIGIN=http://localhost:3000
```

---

## 3. Database Schema (Prisma) — Full Model

```prisma
// schema.prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum RoleName { EMPLOYEE HR_MANAGER HR_PAYROLL_USER HR_PAYROLL_MANAGER ADMIN }
enum EmployeeStatus { ACTIVE INACTIVE ON_LEAVE TERMINATED }
enum ContractStatus { DRAFT RUNNING EXPIRED CANCELLED }
enum AttendanceStatus { PRESENT LATE ABSENT OVERTIME MISSING_CHECKOUT MANUALLY_EDITED }
enum TimeOffRequestStatus { TO_APPROVE APPROVED REFUSED CANCELLED }
enum TimeOffUnit { DAYS HOURS }
enum PayrunStatus { DRAFT COMPUTING COMPUTED VALIDATED PAID ERROR }
enum PayslipStatus { DRAFT COMPUTED WAITING VALIDATED PAID ERROR }
enum SalaryCategory { BASIC ALLOWANCE GROSS DEDUCTION NET }
enum ComputationType { FIXED PERCENTAGE FORMULA PYTHON_LIKE }

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  role          RoleName
  employee      Employee? @relation(fields: [employeeId], references: [id])
  employeeId    String?  @unique
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Department {
  id        String     @id @default(uuid())
  name      String
  employees Employee[]
}

model Employee {
  id             String          @id @default(uuid())
  name           String
  workEmail      String          @unique
  jobPosition    String?
  departmentId   String?
  department     Department?     @relation(fields: [departmentId], references: [id])
  managerId      String?
  manager        Employee?       @relation("ManagerReports", fields: [managerId], references: [id])
  reports        Employee[]      @relation("ManagerReports")
  workingScheduleId String?
  workingSchedule WorkingSchedule? @relation(fields: [workingScheduleId], references: [id])
  status         EmployeeStatus  @default(ACTIVE)
  avatarUrl      String?
  phone          String?
  employeeType   String?         // e.g. Full-time, Contract, Intern — used in dashboard filters
  bankAccount    String?
  bankIfsc       String?
  user           User?
  contracts      Contract[]
  attendances    Attendance[]
  timeOffRequests TimeOffRequest[]
  allocations    TimeOffAllocation[]
  payslips       Payslip[]
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
}

model WorkingSchedule {
  id            String     @id @default(uuid())
  name          String
  company       String     @default("My Company")
  timezone      String     @default("Asia/Kolkata")
  scheduleType  String     @default("Fixed") // Fixed | Flexible | Full Flexible
  totalWeeklyHours Float   // auto-calculated from WorkingScheduleLine on save
  status        String     @default("Active")
  lines         WorkingScheduleLine[]
  employees     Employee[]
  contracts     Contract[]
}

model WorkingScheduleLine {
  id           String   @id @default(uuid())
  scheduleId   String
  schedule     WorkingSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  dayOfWeek    Int      // 0=Mon .. 6=Sun
  startTime    String   // "09:00"
  endTime      String   // "18:00"
  breakMinutes Int      @default(60)
}

model Contract {
  id               String         @id @default(uuid())
  employeeId       String
  employee         Employee       @relation(fields: [employeeId], references: [id])
  department       String?
  jobPosition      String?
  startDate        DateTime
  endDate          DateTime?      // null = open-ended
  wage             Decimal        @db.Decimal(12,2)
  wageType         String         @default("Monthly") // Monthly | Hourly
  salaryStructureId String?
  salaryStructure  SalaryStructure? @relation(fields: [salaryStructureId], references: [id])
  workingScheduleId String?
  workingSchedule  WorkingSchedule? @relation(fields: [workingScheduleId], references: [id])
  status           ContractStatus @default(DRAFT)
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  // DB-level guarantee: no two RUNNING contracts for the same employee may overlap.
  // Implemented via a Postgres exclusion constraint added in a raw SQL migration:
  // ALTER TABLE "Contract" ADD CONSTRAINT no_overlapping_running_contracts
  //   EXCLUDE USING gist (employeeId WITH =, daterange(startDate, endDate, '[]') WITH &&)
  //   WHERE (status = 'RUNNING');
}

model Attendance {
  id            String   @id @default(uuid())
  employeeId    String
  employee      Employee @relation(fields: [employeeId], references: [id])
  checkIn       DateTime
  checkOut      DateTime?
  workedHours   Float?   // computed on checkout
  status        AttendanceStatus @default(PRESENT)
  isManualEdit  Boolean  @default(false)
  editedById    String?
  notes         String?
  createdAt     DateTime @default(now())
}

model TimeOffType {
  id                 String   @id @default(uuid())
  name               String
  unit               TimeOffUnit @default(DAYS)
  requiresAllocation Boolean  @default(true)
  requiresApproval   Boolean  @default(true)
  affectsPayroll     Boolean  @default(true)
  colorHex           String   @default("#6366F1")
  allocations        TimeOffAllocation[]
  requests           TimeOffRequest[]
}

model TimeOffAllocation {
  id            String   @id @default(uuid())
  employeeId    String
  employee      Employee @relation(fields: [employeeId], references: [id])
  timeOffTypeId String
  timeOffType   TimeOffType @relation(fields: [timeOffTypeId], references: [id])
  allocated     Float
  taken         Float    @default(0)   // derived, recalculated on approval
  remaining     Float    @default(0)   // derived = allocated - taken
  validFrom     DateTime
  validTo       DateTime?
  status        String   @default("To Approve") // To Approve | Approved | Refused
}

model TimeOffRequest {
  id            String   @id @default(uuid())
  employeeId    String
  employee      Employee @relation(fields: [employeeId], references: [id])
  timeOffTypeId String
  timeOffType   TimeOffType @relation(fields: [timeOffTypeId], references: [id])
  startDate     DateTime
  endDate       DateTime
  duration      Float    // in unit of TimeOffType
  status        TimeOffRequestStatus @default(TO_APPROVE)
  reason        String?
  approvedById  String?
  approvedAt    DateTime?
  createdAt     DateTime @default(now())
}

model SalaryStructure {
  id          String   @id @default(uuid())
  name        String
  description String?
  isActive    Boolean  @default(true)
  rules       SalaryRule[]
  contracts   Contract[]
  payruns     Payrun[]
}

model SalaryRule {
  id               String          @id @default(uuid())
  structureId      String
  structure        SalaryStructure @relation(fields: [structureId], references: [id], onDelete: Cascade)
  name             String
  code             String          // e.g. "BASIC", "HRA", "PF", "NET" — unique within a structure
  category         SalaryCategory
  sequence         Int
  computationType  ComputationType
  amount           Decimal?        @db.Decimal(12,2)   // FIXED
  percentageOf     String?                              // PERCENTAGE: code to base off
  percentageValue  Decimal?        @db.Decimal(5,2)
  formula          String?                              // FORMULA: safe expression string
  condition        String?                              // optional guard expression
  active           Boolean         @default(true)

  @@unique([structureId, code])
}

model Payrun {
  id                String   @id @default(uuid())
  name              String   // e.g. "February 2026"
  periodStart       DateTime
  periodEnd         DateTime
  salaryStructureId String
  salaryStructure   SalaryStructure @relation(fields: [salaryStructureId], references: [id])
  employeeType      String?  // scope filter used at creation
  status            PayrunStatus @default(DRAFT)
  payslips          Payslip[]
  createdById       String
  createdAt         DateTime @default(now())
  validatedAt       DateTime?
  paidAt            DateTime?
}

model Payslip {
  id            String   @id @default(uuid())
  payrunId      String
  payrun        Payrun   @relation(fields: [payrunId], references: [id])
  employeeId    String
  employee      Employee @relation(fields: [employeeId], references: [id])
  contractId    String
  workedDays    Float
  grossAmount   Decimal  @db.Decimal(12,2)
  netAmount     Decimal  @db.Decimal(12,2)
  status        PayslipStatus @default(DRAFT)
  warnings      Json?    // [{ code: "MISSING_BANK_DETAILS", message: "..." }]
  lines         PayslipLine[]
  pdfUrl        String?  // Cloudflare R2 object URL, set after PDF job completes
  emailSentAt   DateTime?
  createdAt     DateTime @default(now())

  @@unique([payrunId, employeeId]) // prevents duplicate payslips
}

model PayslipLine {
  id         String   @id @default(uuid())
  payslipId  String
  payslip    Payslip  @relation(fields: [payslipId], references: [id], onDelete: Cascade)
  ruleCode   String
  label      String
  category   SalaryCategory
  amount     Decimal  @db.Decimal(12,2)
  sequence   Int
}
```

---

## 4. Auth Module

### Endpoints
| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ accessToken, refreshToken, user }` | matches "Login/User Access Flow" screen |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken }` | rotate refresh token |
| POST | `/auth/logout` | `{ refreshToken }` | `204` | invalidate refresh token |
| GET | `/auth/me` | – | `{ id, email, role, employee }` | used by frontend to hydrate session on load |
| POST | `/auth/change-password` | `{ oldPassword, newPassword }` | `204` | |

- Passwords hashed with **argon2**. Access token payload: `{ sub, email, role, employeeId }`. Access token in `Authorization: Bearer` header; refresh token in an httpOnly secure cookie (or returned to a mobile client body).
- `JwtAuthGuard` on every route by default (`APP_GUARD` global), with `@Public()` decorator to exempt `/auth/login`, `/auth/refresh`.

### RBAC (`common/casl`)
```ts
// ability.factory.ts
export function defineAbilitiesFor(user: User) {
  const { can, cannot, build } = new AbilityBuilder(createMongoAbility);
  switch (user.role) {
    case 'EMPLOYEE':
      can('read', 'Attendance', { employeeId: user.employeeId });
      can('create', 'TimeOffRequest', { employeeId: user.employeeId });
      can('read', 'TimeOffAllocation', { employeeId: user.employeeId });
      can('read', 'Payslip', { employeeId: user.employeeId });
      break;
    case 'HR_MANAGER':
      can('manage', ['Employee','Contract','WorkingSchedule','Attendance','TimeOffRequest','TimeOffAllocation','TimeOffType']);
      break;
    case 'HR_PAYROLL_USER':
      can('manage', ['Employee','Contract','WorkingSchedule','Attendance','TimeOffRequest','TimeOffAllocation','TimeOffType']);
      can(['read','create','update'], ['Payrun','Payslip']);
      can('read', ['SalaryStructure','SalaryRule']);
      break;
    case 'HR_PAYROLL_MANAGER':
      can('manage', ['Employee','Contract','WorkingSchedule','Attendance','TimeOffRequest','TimeOffAllocation','TimeOffType','Payrun','Payslip','SalaryStructure','SalaryRule']);
      break;
    case 'ADMIN':
      can('manage', 'all');
      break;
  }
  return build();
}
```
Use `@CheckAbility({ action: 'update', subject: 'Contract' })` decorator + `AbilitiesGuard` on every protected controller method.

---

## 5. HR Core Endpoints (full CRUD reference)

> All list endpoints support `?page=&limit=&search=&sort=&filter[field]=` query params and return `{ data: [], meta: { total, page, limit } }`.

### Users (`/users`) — Admin-only, screen: "User Management"
- `GET /users` — list, filterable by role
- `POST /users` — create (email, role, employeeId, temp password → emailed)
- `PATCH /users/:id` — update role/status
- `DELETE /users/:id` — deactivate (soft delete, never hard-delete audit trail)

### Employees (`/employees`) — screens: Employee Kanban, List, Form
- `GET /employees` — supports `view=kanban|list`; kanban groups by `status` or `departmentId`
- `GET /employees/:id` — full form payload incl. `department`, `manager`, `workingSchedule`
- `POST /employees`
- `PATCH /employees/:id`
- `DELETE /employees/:id`
- `GET /employees/:id/contracts` — smart-button target
- `GET /employees/:id/attendance` — smart-button target
- `GET /employees/:id/time-off` — smart-button target
- `GET /employees/:id/timeline` — combined chronological feed (contracts + leave + schedule changes) for the "Time-Travel Timeline" feature

### Departments (`/departments`) — simple CRUD, used in Employee form + Dashboard filters

### Contracts (`/contracts`) — screens: Contracts list, Contract/Employee form
- `GET /contracts?employeeId=` 
- `POST /contracts` — **server validates no overlapping RUNNING contract** (catches DB exclusion-constraint violation and returns `409 CONFLICT` with a clear message)
- `PATCH /contracts/:id`
- `GET /contracts/active?employeeId=&date=` — **critical endpoint**: resolves the one contract applicable to a given payroll date; used internally by the Payroll Engine and exposed for the frontend's "current contract" badge

### Working Schedules (`/working-schedules`) — screens: List/Form, Weekly Schedule sub-view
- `GET /working-schedules`
- `POST /working-schedules` — body includes `lines: [{dayOfWeek, startTime, endTime, breakMinutes}]`; `totalWeeklyHours` is computed server-side, never accepted from client
- `PATCH /working-schedules/:id`
- `GET /working-schedules/:id` — returns lines sorted by dayOfWeek for the weekly grid view

### Attendance (`/attendance`) — screens: global Attendance list, Employee-scoped list, Attendance Widget
- `GET /attendance?employeeId=&dateFrom=&dateTo=&status=`
- `POST /attendance/check-in` — body `{ employeeId }` (or inferred from JWT for self-service widget) → creates row with `checkIn=now()`
- `POST /attendance/:id/check-out` — sets `checkOut=now()`, computes `workedHours`, derives `status` (e.g. `MISSING_CHECKOUT` if >16h gap flagged async, `OVERTIME` if hours > schedule expectation)
- `PATCH /attendance/:id` — manual correction, requires `AbilitiesGuard` (`update, Attendance`) restricted to HR roles; sets `isManualEdit=true`, `editedById`
- `GET /attendance/widget/today` — for the floating "Attendance Widget" — returns today's open session for the current user

### Time Off
- **Types** `/time-off/types` — full CRUD (name, unit, requiresAllocation, requiresApproval, affectsPayroll)
- **Allocations** `/time-off/allocations`
  - `GET /time-off/allocations?employeeId=`
  - `POST /time-off/allocations` — HR creates, status defaults `To Approve`
  - `PATCH /time-off/allocations/:id/approve` — sets `remaining = allocated`
- **Requests** `/time-off/requests`
  - `GET /time-off/requests?employeeId=&status=`
  - `POST /time-off/requests` — employee self-service; server checks `remaining` balance if `type.requiresAllocation`, returns `422` if insufficient
  - `PATCH /time-off/requests/:id/approve` — **transactional**: sets status `APPROVED`, decrements the matching `TimeOffAllocation.remaining` and increments `.taken`
  - `PATCH /time-off/requests/:id/refuse`

---

## 6. Payroll Module (the core engineering effort)

### Salary Structures (`/payroll/structures`)
- Full CRUD; `GET /payroll/structures/:id` returns ordered `rules[]`

### Salary Rules (`/payroll/structures/:structureId/rules`)
- `POST` — validate `code` uniqueness within structure, `sequence` uniqueness
- `PATCH /:ruleId`, `DELETE /:ruleId`
- `POST /payroll/rules/validate` — dry-run a formula against a sample context, returns computed value or a parse error (used by the frontend's live rule editor)

### The Rule Engine (`payroll/rule-engine/engine.service.ts`)
```ts
interface RuleContext { [code: string]: number }

class RuleEngine {
  run(rules: SalaryRule[], baseContext: { basicWage: number; workedDays: number; totalDays: number }): { context: RuleContext; lines: PayslipLine[] } {
    const context: RuleContext = { ...baseContext };
    const lines: PayslipLine[] = [];
    const sorted = [...rules].sort((a, b) => a.sequence - b.sequence);

    for (const rule of sorted) {
      if (rule.condition && !this.evalSafe(rule.condition, context)) continue;
      let value: number;
      switch (rule.computationType) {
        case 'FIXED':
          value = Number(rule.amount);
          break;
        case 'PERCENTAGE':
          value = (context[rule.percentageOf!] ?? 0) * (Number(rule.percentageValue) / 100);
          break;
        case 'FORMULA':
          value = this.evalSafe(rule.formula!, context); // mathjs.evaluate(scope) — never eval()
          break;
      }
      context[rule.code] = value;
      lines.push({ ruleCode: rule.code, label: rule.name, category: rule.category, amount: value, sequence: rule.sequence } as PayslipLine);
    }
    return { context, lines };
  }

  private evalSafe(expr: string, scope: RuleContext): number {
    // use mathjs.evaluate(expr, scope) inside a limited parser instance
    // with no access to JS globals — reject any expr containing disallowed tokens
  }
}
```
`baseContext.workedDays / totalDays` lets `FORMULA` rules pro-rate for partial-period joiners/leavers (e.g. `BASIC * (workedDays/totalDays)`).

### Payruns (`/payroll/payruns`) — Two-step wizard backend support
- `POST /payroll/payruns/preview-scope` — **Step 1**: body `{ salaryStructureId, periodStart, periodEnd, employeeType? }` → returns list of *eligible* employees (active contract overlapping period, matching type) **without creating anything** — powers the "Select Employee Records" screen
- `POST /payroll/payruns` — **Step 2 / Create Payrun**: body `{ name, salaryStructureId, periodStart, periodEnd, employeeIds: [] }` → creates `Payrun` (status `DRAFT`) + one `Payslip` (status `DRAFT`) per selected employee. Only fires on explicit "Create Payrun" click, never during Step 1.
- `GET /payroll/payruns` / `GET /payroll/payruns/:id` — includes payslip summary list
- `POST /payroll/payruns/:id/compute` — enqueues a BullMQ job per payslip (`compute-payslip` queue); returns `202` immediately, sets Payrun status `COMPUTING`; frontend polls or listens on WebSocket for completion
- `POST /payroll/payruns/:id/validate` — server checks **no unresolved warnings** across all payslips; if clean, sets `VALIDATED`; else `400` with the list of blocking warnings
- `POST /payroll/payruns/:id/mark-paid` — only from `VALIDATED`; sets `PAID`, `paidAt=now()`; payslips become immutable (guard blocks any further `PATCH`)
- `POST /payroll/payruns/:id/send-payslips` — enqueues bulk `send-payslip-email` jobs

### Payslips (`/payroll/payslips`)
- `GET /payroll/payslips?payrunId=&employeeId=&status=`
- `GET /payroll/payslips/:id` — full detail incl. ordered `lines[]`
- `GET /payroll/payslips/:id/pdf` — returns signed Cloudflare R2 URL (generates on-demand via job if not cached)
- `POST /payroll/payslips/:id/recompute` — re-runs the engine for a single payslip (only while Payrun is not `PAID`)

### Compute-Payslip Job (BullMQ processor)
```
1. Resolve applicable Contract for (employeeId, payrun.periodStart)
   → if none: mark payslip ERROR, warning "NO_ACTIVE_CONTRACT"
2. Resolve workedDays from Attendance + approved TimeOff within period
3. Run RuleEngine(structure.rules, { basicWage: contract.wage, workedDays, totalDays })
4. Persist PayslipLine[] snapshot, grossAmount, netAmount
5. Run warning checks:
   - MISSING_BANK_DETAILS (employee.bankAccount is null)
   - DUPLICATE_PAYSLIP (unique constraint would have caught creation, re-verify)
   - CONTRACT_ENDING_SOON (informational)
6. Set payslip.status = COMPUTED (or ERROR), emit event `payslip.computed`
```

### Warnings shape (returned to frontend)
```json
{ "code": "MISSING_BANK_DETAILS", "severity": "blocking", "message": "Employee has no bank account on file." }
```

---

## 7. PDF Generation & Email

- **PDF**: render an HTML payslip template (same design tokens as web) with employee/company data injected → Puppeteer `page.pdf()` → upload buffer to Cloudflare R2 via `@aws-sdk/client-s3` (R2 endpoint) → store returned object URL on `Payslip.pdfUrl`.
- **Email**: Resend transactional email with the PDF as an attachment or a signed R2 download link; template includes payslip summary. Bulk send iterates payslips in the Payrun, one job per payslip (so one failure doesn't block the batch) and records `emailSentAt`.

---

## 8. Dashboard / Reporting Endpoints (`/dashboard`)

All accept common filters: `?period=&departmentId=&employeeType=&companyId=`

| Endpoint | Returns |
|---|---|
| `GET /dashboard/kpis` | `{ totalNetSalaryPaid, payslipsGenerated, avgSalary, approvedTimeOffDays, attendanceHealthPct }` |
| `GET /dashboard/salary-cost-by-department` | `[{ department, totalCost }]` for bar chart |
| `GET /dashboard/monthly-net-salary-trend` | `[{ month, netTotal }]` for line chart |
| `GET /dashboard/payslip-status-breakdown` | `[{ status, count }]` for donut/status chart |
| `GET /dashboard/alerts` | list of current payroll warnings across active payruns |
| `GET /dashboard/attendance-overview` | `{ present, late, absent, overtime, missingCheckouts, manualEdits, coveragePct }` |
| `GET /dashboard/time-off-overview` | `{ approvedDays, pendingRequests, byType: [] }` |
| `GET /dashboard/department-overview` | `[{ department, headcount, totalSalary }]` |

Implementation note: back these with either (a) direct aggregate SQL queries via Prisma `groupBy`/raw SQL for the hackathon, or (b) a nightly-refreshed materialized view (`dashboard_aggregates`) for production scale — start with (a), design the endpoint response shape so swapping to (b) later is invisible to the frontend.

---

## 9. Sentry Setup (Backend) — Detailed

### Install & Init
```ts
// main.ts (must be the very first import)
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT,
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 1.0),
  profilesSampleRate: 1.0,
});
```

### Global Exception Filter → Sentry
```ts
// common/filters/all-exceptions.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;

    if (status >= 500) {
      Sentry.captureException(exception); // only report real server errors, not 4xx validation noise
    }
    response.status(status).json({
      statusCode: status,
      message: exception instanceof HttpException ? exception.getResponse() : 'Internal server error',
    });
  }
}
```
Register globally in `app.module.ts` via `APP_FILTER`.

### Tagging Context (critical for a payroll system)
On every authenticated request, attach user context so errors are traceable to a specific tenant/user/role — set in a NestJS interceptor:
```ts
Sentry.setUser({ id: user.id, email: user.email, role: user.role });
Sentry.setTag('module', req.route.path.split('/')[1]); // e.g. 'payroll', 'attendance'
```

### Custom instrumentation for payroll jobs (highest-value Sentry use in this app)
Wrap every BullMQ processor so failures in async payroll computation — which would otherwise fail silently in a background worker — are captured with full context:
```ts
// jobs/compute-payslip.processor.ts
@Process('compute-payslip')
async handleComputePayslip(job: Job<{ payslipId: string }>) {
  const transaction = Sentry.startTransaction({ name: 'compute-payslip', op: 'job' });
  try {
    await this.payslipService.compute(job.data.payslipId);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { job: 'compute-payslip' },
      extra: { payslipId: job.data.payslipId, payrunId: job.data.payrunId },
    });
    throw err; // let BullMQ retry per its backoff policy
  } finally {
    transaction.finish();
  }
}
```

### Breadcrumbs for payroll state transitions
Add a breadcrumb on every Payrun/Payslip status change (`Draft→Computed→Validated→Paid`) so a Sentry error report shows the exact sequence of state transitions leading up to a failure — invaluable for debugging "why did this payslip end up in ERROR."
```ts
Sentry.addBreadcrumb({ category: 'payrun', message: `Payrun ${id} → ${newStatus}`, level: 'info' });
```

### Alerts to configure in the Sentry dashboard
1. Any `500` in `/payroll/*` routes → immediate Slack/email alert (money-adjacent bugs are urgent)
2. Job failure rate > 5% on `compute-payslip` queue over 10 minutes
3. New issue type first-seen in `production` environment

### Performance monitoring
Enable `@sentry/node` tracing middleware to capture slow endpoints — set a lower sample rate (e.g. `0.2`) once past initial development to control quota usage.

---

## 10. API Contract Summary for Frontend Integration

- **Base URL:** `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:4000/api/v1`)
- **Auth:** `Authorization: Bearer <accessToken>` header on every request except `/auth/login`, `/auth/refresh`
- **Errors:** always `{ statusCode, message, code? }` — frontend should branch on `code` for known business errors (`NO_ACTIVE_CONTRACT`, `INSUFFICIENT_BALANCE`, `OVERLAPPING_CONTRACT`, `DUPLICATE_PAYSLIP`) to show precise inline messages instead of generic toasts
- **Pagination:** `{ data, meta: { total, page, limit } }` on every list endpoint — frontend table components should be built against this shape once, generically
- **Swagger/OpenAPI:** expose at `/api/docs` (via `@nestjs/swagger`) and export `openapi.json` — the frontend can codegen a typed API client from this (e.g. via `openapi-typescript` or `orval`) so both sides share exact request/response types without manual duplication. **This is the recommended hand-off artifact between independent backend/frontend development tracks.**
- **CORS:** allow `CORS_ORIGIN` from env, credentials `true` (for refresh-token cookie flow)
- **WebSocket (optional, for live Payrun compute progress):** NestJS `@WebSocketGateway` emitting `payrun.progress` events `{ payrunId, computed, total }` — frontend subscribes while Payrun status is `COMPUTING`

---

## 11. Build Order for the Backend Track

1. Auth + Users + RBAC scaffolding + Sentry wired in from day one
2. Departments, Employees (CRUD + smart-button sub-resources)
3. Working Schedules (with auto-computed weekly hours) + Contracts (with overlap constraint)
4. Attendance (check-in/out, widget endpoint, manual correction)
5. Time Off (Types → Allocations → Requests → approval balance logic)
6. Salary Structures + Salary Rules + Rule Engine + `/validate` dry-run endpoint
7. Payruns (two-step wizard endpoints) + Payslips + BullMQ compute pipeline
8. PDF generation + Cloudflare R2 upload + email sending
9. Dashboard aggregation endpoints
10. Swagger export + finalize OpenAPI contract for frontend hand-off
