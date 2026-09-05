# PeoplePay360

HR and payroll operations in one place: employees, contracts, working schedules,
attendance, time off, and a payroll engine where **salary rules actually drive
payslip computation**.

```
people_pay/
├── backend/    NestJS + Prisma + Neon Postgres   → http://localhost:4000/api/v1
├── frontend/   Next.js 16 + Tailwind v4 + TanStack Query → http://localhost:3000
└── specs/      Product spec, architecture notes and the source mockups
```

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
npm run prisma:seed       # demo employees, contracts, salary structure
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

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL points at the API
npm run dev
```

### Demo accounts

Seeded by `npm run prisma:seed`:

| Email | Role | Password |
|---|---|---|
| `admin@peoplepay360.com` | Administrator | `password123` |
| `hrpayroll@peoplepay360.com` | HR Payroll User | `password123` |
| `john.doe@peoplepay360.com` | Employee | `password123` |

Roles change what you see: an administrator lands on the payroll dashboard, an
employee lands on their own attendance and can only ever read their own records.

---

## Infrastructure

| Concern | Service | Notes |
|---|---|---|
| Database | **Neon** (serverless Postgres) | Standard `postgresql://` URL against the pooled endpoint. Schema is applied with `prisma db push`, so there is no migration history table. |
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

Worked example from the seeded structure, on a ₹50,000 basic:

| Seq | Rule | Computation | Amount |
|---|---|---|---|
| 1 | Basic Salary | fixed | 50,000.00 |
| 2 | House Rent Allowance | 40% of BASIC | 20,000.00 |
| 3 | Provident Fund | 12% of BASIC | −6,000.00 |
| 4 | Gross Salary | `BASIC + HRA` | 70,000.00 |
| 5 | Net Salary | `GROSS - PF` | **64,000.00** |

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
the frontend's list and detail hooks were written once against one shape.

**Errors carry a `code`.** `OVERLAPPING_CONTRACT`, `INSUFFICIENT_BALANCE`,
`BLOCKING_WARNINGS`, `PAYRUN_IMMUTABLE` and friends let the UI show a precise
inline message instead of a generic toast.

**Balances are never client-supplied.** Approving leave updates the request and
debits the allocation inside one transaction; `remaining` is derived server-side.

---

## Design system

Dark-first, borders-only depth, one indigo accent. The signature is a **ledger
rail**: tabular JetBrains Mono numerals in hairline-ruled columns, used
identically in the KPI strip, every table, and the payslip breakdown — so a
figure looks the same wherever it appears. Status colour means one thing across
all modules (green is settled, whether that is an approved leave request, a
running contract, or a paid payslip).

Tokens live in `frontend/src/app/globals.css`. Light and dark are both defined
as complete palettes; only lightness moves between them.

---

## Checks

```bash
cd backend  && npm run build && npm run lint
cd frontend && npm run typecheck && npm run lint && npm run build
```

Regenerate the typed API surface from a running backend:

```bash
cd frontend && npm run codegen
```
