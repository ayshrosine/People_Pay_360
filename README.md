<div align="center">

<img src="specs/icon.svg" width="72" height="72" alt="" />

# Odoo PNX

**HR and payroll in one workspace — where salary rules actually drive payslip computation.**

Employees · Contracts · Attendance · Time off · Payroll

<br />

[![Backend](https://img.shields.io/badge/backend-NestJS_12-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com)
[![Frontend](https://img.shields.io/badge/frontend-Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Database](https://img.shields.io/badge/database-Neon_Postgres-00E599?style=flat-square&logo=postgresql&logoColor=white)](https://neon.tech)
[![ORM](https://img.shields.io/badge/ORM-Prisma_5-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://prisma.io)
[![Storage](https://img.shields.io/badge/storage-Cloudflare_R2-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/r2/)
[![Tests](https://img.shields.io/badge/tests-63_passing-22c55e?style=flat-square)](#-testing)

</div>

---

## Contents

<table>
<tr><td width="50%" valign="top">

**Getting started**
- [What this is](#-what-this-is)
- [Requirements](#-requirements)
- [Quick start](#-quick-start)
- [Environment variables](#-environment-variables)
- [Demo accounts](#-demo-accounts)

</td><td width="50%" valign="top">

**Understanding it**
- [Architecture](#-architecture)
- [The modules](#-the-modules)
- [How payroll computes](#-how-payroll-actually-computes)
- [Permissions](#-permissions)
- [Design system](#-design-system)

</td></tr>
<tr><td width="50%" valign="top">

**Working on it**
- [Project structure](#-project-structure)
- [Commands](#-commands)
- [Testing](#-testing)

</td><td width="50%" valign="top">

**Shipping it**
- [Deployment](#-deployment)
- [Documentation](#-documentation)
- [Troubleshooting](#-troubleshooting)

</td></tr>
</table>

---

## ✦ What this is

A complete HR and payroll system. It keeps a directory of **employees** and the
**departments** they belong to, records each person's **contract** — their wage
and the **working schedule** they are rostered for — tracks **attendance** and
**time off**, and runs **payroll**.

The part worth understanding is the payroll engine. Salary is not a number
somebody types into a form. It is **computed**, line by line, from the contract
wage, the days actually worked, and an ordered list of salary rules — then
frozen as a permanent record with a PDF.

<table>
<tr><td width="50%" valign="top">

**🔒 Authorisation enforced twice, only one counts**

The API is the real boundary. The frontend mirrors the policy purely to hide
buttons you cannot use.

</td><td width="50%" valign="top">

**📸 A payslip is a snapshot, not a view**

Every computed line is stored. Editing a salary rule next month cannot rewrite
what someone was already paid.

</td></tr>
<tr><td width="50%" valign="top">

**🧮 Formulas are sandboxed, never `eval`**

A hardened mathjs instance with runtime extension points disabled and a token
blocklist.

</td><td width="50%" valign="top">

**👥 Some authority is a relationship**

A department head is an ordinary employee who can approve their own
department's leave. No role can express that.

</td></tr>
</table>

---

## ✦ Requirements

| | Version | Notes |
|---|---|---|
| **Node.js** | 20 or newer (22 recommended) | `node -v` |
| **npm** | 10 or newer | Ships with Node |
| **Neon account** | — | Free tier is plenty — [neon.tech](https://neon.tech) |
| **Cloudflare R2** | optional | Only for storing payslip PDFs |
| **Redis** | optional | Only to run payslip computation on a queue |
| **`psql`** | optional | To apply one database constraint |

Everything except Node and a Neon database is optional — each feature degrades
explicitly rather than crashing at startup.

---

## ✦ Quick start

### 1 · Clone

```bash
git clone <your-repo-url> odoo-pnx
cd odoo-pnx
```

### 2 · Backend

```bash
cd backend
npm install
cp .env.example .env          # fill in DATABASE_URL + the two JWT secrets

npx prisma generate           # generate the typed database client
npx prisma db push            # create the schema on Neon
```

Apply the contract-overlap constraint once — see [why](#the-contract-overlap-constraint):

```bash
psql "$DATABASE_URL" -f prisma/sql/001_no_overlapping_running_contracts.sql
```

Seed demo data and start:

```bash
npm run prisma:seed           # users, base employees, salary structure
npm run seed:demo             # 9 more staff, ~1,700 attendance rows, leave
npm run seed:heads            # a head for each department
npm run start:dev             # → http://localhost:4000/api/v1
```

With the server running, create payruns **through the real API**, so every
figure comes from the rule engine rather than a fixture:

```bash
npm run payruns:demo
```

### 3 · Frontend

```bash
cd ../frontend
npm install
cp .env.example .env.local    # NEXT_PUBLIC_API_URL points at the API
npm run dev                   # → http://localhost:3000
```

### 4 · Sign in

Open **http://localhost:3000** and use any [demo account](#-demo-accounts).

<div align="center">

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| API | http://localhost:4000/api/v1 |
| Swagger UI | http://localhost:4000/api/docs |
| OpenAPI JSON | http://localhost:4000/api/docs-json |

</div>

---

## ✦ Environment variables

### Backend — `backend/.env`

**Required.** The server refuses to boot without these.

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@…neon.tech/neondb?sslmode=require` | Neon pooled endpoint |
| `JWT_ACCESS_SECRET` | 32+ random characters | Signs 15-minute access tokens |
| `JWT_REFRESH_SECRET` | 32+ random characters | **Must differ** from the access secret |

**Optional.** Each feature degrades cleanly when absent.

| Variable | Without it |
|---|---|
| `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY` | Defaults to `15m` / `7d` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` | Payslip PDFs stream inline instead of being stored |
| `REDIS_URL` | Payslip computation runs inline instead of on a queue |
| `RESEND_API_KEY`, `EMAIL_FROM` | "Send payslips" is disabled rather than failing at send time |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE` | Error tracking no-ops |
| `CORS_ORIGIN` | Defaults to `http://localhost:3000`. Comma-separate multiple origins |
| `PORT` | Defaults to `4000` |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Frontend — `frontend/.env.local`

| Variable | Example |
|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` |

> ⚠️ `NEXT_PUBLIC_*` variables are **baked into the browser bundle at build
> time**. Changing one after `next build` does nothing — you have to rebuild.
> Never put a secret in one.

> 🔐 `backend/.env` is gitignored and must stay that way.

---

## ✦ Demo accounts

All use the password `password123`.

| Email | Role | Lands on | Can |
|---|---|---|---|
| `admin@odoopnx.com` | Administrator | Dashboard | Everything |
| `hrpayroll@odoopnx.com` | HR Payroll User | Dashboard | HR data + run payroll |
| `john.doe@odoopnx.com` | Employee **& Head of Engineering** | Attendance | Own records + approve Engineering's leave |

Sign in as **John Doe** to see the most interesting case: an ordinary
`EMPLOYEE` who is still denied the dashboard, payruns and employee management —
but who can approve leave for Engineering, because `Department.headId` points at
him.

> ⚠️ Change or delete these before any real deployment.

---

## ✦ Architecture

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│         FRONTEND             │        │          BACKEND             │
│  Next.js 16 · React 19       │  HTTPS │  NestJS 12 · TypeScript      │
│  Tailwind v4 · TanStack Query│ ─────► │  Prisma 5 · CASL             │
│  Zustand · Radix · Recharts  │  JWT   │  argon2 · mathjs · Puppeteer │
└──────────────────────────────┘        └───────────────┬──────────────┘
         :3000                                          │  :4000
                                          ┌─────────────┼─────────────┐
                                          ▼             ▼             ▼
                                   ┌───────────┐ ┌───────────┐ ┌───────────┐
                                   │   Neon    │ │Cloudflare │ │   Redis   │
                                   │ Postgres  │ │    R2     │ │ (optional)│
                                   └───────────┘ └───────────┘ └───────────┘
```

**They are separate programs.** The frontend has no database access at all — it
can only ask the API. Every rule lives in the backend, because that is the only
place a user cannot bypass.

### What runs around every request

```
Request
  ├─ 1. JwtAuthGuard        Who are you?           → 401
  ├─ 2. AbilitiesGuard      May you do this?       → 403
  ├─ 3. ValidationPipe      Is the body correct?   → 400
  │       controller → service → Prisma → Neon
  ├─ 4. TransformInterceptor   wrap as { data, meta? }
  ├─ 5. LoggingInterceptor     method, path, status, duration
  └─ 6. AllExceptionsFilter    any error → clean JSON with a `code`
                                                    → Response
```

### The stack

<table>
<tr><td valign="top" width="50%">

**Backend**

| Package | Version | Role |
|---|---|---|
| `@nestjs/core` | 12 | Framework |
| `@prisma/client` | 5.22 | ORM |
| `@casl/ability` | 7 | Permissions |
| `argon2` | 0.45 | Password hashing |
| `mathjs` | 15 | Sandboxed formulas |
| `puppeteer` | 25 | PDF rendering |
| `@aws-sdk/client-s3` | 3 | Cloudflare R2 |
| `bullmq` | 6 | Optional queue |
| `class-validator` | 0.15 | Request validation |

</td><td valign="top" width="50%">

**Frontend**

| Package | Version | Role |
|---|---|---|
| `next` | 16.3 | App Router |
| `react` | 19.2 | UI |
| `@tanstack/react-query` | 5 | Server state |
| `zustand` | 5 | Client state |
| `axios` | 1.20 | HTTP + token refresh |
| `tailwindcss` | 4 | Styling |
| `recharts` | 3 | Charts |
| `lucide-react` | 1.41 | Icons |
| `sonner` | 2 | Toasts |

</td></tr>
</table>

---

## ✦ The modules

| Module | Route | What it does |
|---|---|---|
| **Dashboard** | `/dashboard` | Live payroll KPIs, salary cost by department, net-salary trend, alerts |
| **Employees** | `/employees` | Directory (kanban or list), full record, department leadership |
| **Contracts** | `/contracts` | Employment terms: wage, salary structure, **working schedule**, period |
| **Time & Attendance** | `/time-off` | Attendance, leave requests, allocations, leave types |
| **Working schedules** | `/working-schedules` | Rostered days and hours, attached to contracts |
| **Payroll** | `/payroll` | Payruns, payslips, salary structures and rules |
| **Users** | `/admin/users` | Accounts and roles |

**Attendance sits inside Time & Attendance** rather than in a module of its own:
leave and attendance are two answers to the same question — *who was at work* —
and payroll reads both to decide what a period is worth.

**A working schedule belongs to a contract, not a person.** A schedule is a term
of employment: someone who moves to part time in July must still be judged
against the full-time roster for June. A field on the employee could only ever
describe *today*.

**Each department can have a head** — an ordinary employee who may approve and
refuse leave for their own department, never another's and never their own.
Appoint one from any employee's page.

---

## ✦ How payroll actually computes

This is what separates the app from a CRUD form over a payslip table.

1. **A salary structure is an ordered list of rules.** Each has a `code`, a
   `category` (BASIC / ALLOWANCE / DEDUCTION / GROSS / NET), a `sequence`, and a
   computation type — a fixed amount, a percentage of an earlier rule, or a
   formula.
2. **The engine runs them in sequence**, writing every result into a shared
   context keyed by rule code, so a later rule can reference an earlier one
   (`GROSS - PF`). Formulas run in a hardened mathjs instance — never `eval`.
3. **Every result is persisted as a `PayslipLine`.** A payslip is a *snapshot*.
4. **The state machine is guarded end to end:**
   `DRAFT → COMPUTING → COMPUTED → VALIDATED → PAID`.
   Validation is blocked while any payslip carries a blocking warning, and a
   `PAID` payrun is immutable.

Worked example on a ₹50,000 monthly contract, for a full month:

| Seq | Rule | Computation | Amount |
|---:|---|---|---:|
| 1 | Basic Salary | `basicWage * (workedDays / totalDays)` | 50,000.00 |
| 2 | House Rent Allowance | 40% of `BASIC` | 20,000.00 |
| 3 | Provident Fund | 12% of `BASIC` | −6,000.00 |
| 4 | Gross Salary | `BASIC + HRA` | 70,000.00 |
| 5 | **Net Salary** | `GROSS - PF` | **64,000.00** |

`totalDays` counts the days the contract's **schedule rosters**, not calendar
days — so perfect attendance pays exactly the contract wage.

### The contract-overlap constraint

Payroll must answer *"which contract applied on this date?"* with exactly one
row. Enforced twice: the service returns `409 OVERLAPPING_CONTRACT`, and
Postgres guarantees it underneath.

```bash
psql "$DATABASE_URL" -f backend/prisma/sql/001_no_overlapping_running_contracts.sql
```

**Both layers are needed.** Application checks have a race condition; two
simultaneous requests can both look, both see nothing, and both insert.

---

## ✦ Permissions

| Role | Can |
|---|---|
| `EMPLOYEE` | Read **their own** record, contract, attendance, leave, payslips. Create attendance and leave requests |
| `HR_MANAGER` | Manage all HR data. Read the dashboard. **No payroll** |
| `HR_PAYROLL_USER` | All HR data, plus read/create/update payruns and payslips. Read-only on salary rules |
| `HR_PAYROLL_MANAGER` | Everything HR and payroll, including editing salary rules |
| `ADMIN` | Everything, including user accounts |

The split between `HR_PAYROLL_USER` and `HR_PAYROLL_MANAGER` is deliberate: the
person who *runs* payroll each month is not necessarily the person allowed to
change *how salary is calculated*.

**Two layers, only one that counts.** `can('read', 'Employee')` is true for an
`EMPLOYEE` — but they must see only themselves, so list queries for self-service
roles are additionally scoped by `employeeId`. The role check says *whether you
may use the endpoint*; the scoping says *which rows come back*.

**Errors carry a code** — `OVERLAPPING_CONTRACT`, `INSUFFICIENT_BALANCE`,
`BLOCKING_WARNINGS`, `PAYRUN_IMMUTABLE`, `EMPLOYEE_HAS_RECORDS` — so the UI
shows a precise inline message instead of a generic toast.

---

## ✦ Project structure

```
odoo-pnx/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma            ← the single source of truth for the DB
│   │   ├── sql/                     one-off constraints
│   │   ├── seed.ts                  base data
│   │   ├── seed-demo.js             representative data
│   │   └── seed-heads.js            department heads
│   ├── scripts/                     one-off migrations + payrun creation
│   ├── test/                        end-to-end suites
│   └── src/
│       ├── common/                  guards, interceptors, filters, abilities
│       ├── auth/  users/            sign-in and accounts
│       ├── employees/ departments/  the people
│       ├── contracts/ working-schedules/
│       ├── attendance/ time-off/
│       ├── payroll/                 rule engine, payruns, payslips, PDFs
│       ├── dashboard/               live figures
│       └── files/ jobs/             R2 storage, optional queue
│
├── frontend/src/
│   ├── app/
│   │   ├── (auth)/login/            sign-in, animated lattice background
│   │   └── (dashboard)/             everything behind auth
│   ├── components/
│   │   ├── layout/                  sidebar, top bar, command palette, shell
│   │   ├── ui/                      primitives, tables, overlays, status
│   │   └── dashboard/               charts and KPI widgets
│   ├── hooks/use-resources.ts       ← every query and mutation, one file
│   ├── lib/api/                     axios client, types, error normalising
│   ├── lib/abilities/               frontend mirror of the CASL policy
│   └── stores/                      auth tokens, UI prefs, filters
│
├── specs/
│   ├── modules/                     ← every file explained, for newcomers
│   ├── IMPORTANT.md                 invariants that keep payroll trustworthy
│   ├── PROJECT_STATUS.md            what works today
│   └── DEPLOYMENT.md                Zerops, step by step
│
└── zerops.yml                       deployment configuration
```

---

## ✦ Commands

### Backend

| Command | Does |
|---|---|
| `npm run start:dev` | Development server with hot reload |
| `npm run build` | Compile to `dist/` |
| `npm run lint` | Lint |
| `npx prisma generate` | Regenerate the typed client after a schema edit |
| `npx prisma db push` | Apply the schema to Neon |
| `npx prisma studio` | Browse the data in a GUI |
| `npm run prisma:seed` | Base data |
| `npm run seed:demo` | Representative data |
| `npm run seed:heads` | Department heads |
| `npm run payruns:demo` | Payruns, via the real API |

> ⚠️ Do not run `npm run build` while `start:dev` is watching — it rewrites
> `dist/` underneath the watcher and the server exits with
> `Cannot find module dist/main`. Stop the watcher first.

### Frontend

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Lint |
| `npm run codegen` | Regenerate typed API surface from a running backend |

---

## ✦ Testing

Plain Node scripts against a **running server and the real database** — the
value here is exercising the actual stack, not mocks.

```bash
# Both servers must be running.
cd backend && APP_URL=http://localhost:3000 npm run test:all
```

| Suite | Command | Checks |
|---|---|---|
| API contract & RBAC | `npm run test:api` | **50** |
| Department heads | `npm run test:heads` | **13** |
| Browser walkthrough | `npm run test:ui` | 23 pages × 3 roles |
| Head's UI | `npm run test:head-ui` | Approve controls render |

**Every check asserts the negative too.** Proving an admin *can* do something is
half a test; proving an employee *cannot* is the other half.

The browser walkthrough fails on console errors, failed API calls, error
boundaries and blank renders — not only on crashes. Screenshots land in
`backend/.ui-shots/` (gitignored).

<details>
<summary><b>Bugs these tests actually caught</b></summary>

<br />

None of these were visible from reading the code. They appeared the moment real
data went through the real stack.

- Payroll ignored contract wages — a fixed `BASIC` paid everyone the same.
- Pro-rating divided by calendar days, docking every employee ~27%.
- `null` responses arrived as empty bodies, read as `undefined` by the client.
- Deleting an employee with history returned a raw `500`.
- A `<div>` inside a `<p>` caused a hydration mismatch.
- An employee's payslip page requested payruns and earned a 403.
- Leave requests were not row-scoped — any employee could read every colleague's.
- `Math.sin` in the login background differed between Node and the browser.
- `@IsUUID()` rejected valid ids, because ids here are opaque strings.

</details>

---

## ✦ Design system

Dark-first, **borders-only depth**, one indigo accent. A fixed left rail names
the module; the bar above carries the breadcrumb, ⌘K search, theme toggle and
account. Each page opens with a mono micro-label and a large display title, so
the eye lands in the same place on every screen.

The signature is the **ledger rail**: tabular JetBrains Mono numerals in
hairline-ruled columns, used identically in the KPI strip, every table and the
payslip breakdown — so a figure looks the same wherever it appears.

**Status colour means one thing across all modules.** Green is settled, whether
that is an approved leave request, a running contract, or a paid payslip.

Motion is one easing curve (`cubic-bezier(0.23, 1, 0.32, 1)`): buttons lift with
an accent glow, table rows grow the accent rail that selection uses, pages settle
in over 300 ms. All of it honours `prefers-reduced-motion`.

Tokens live in `frontend/src/app/globals.css`. Light and dark are both complete
palettes; only lightness moves. **Never hard-code a colour** — it works in one
theme and breaks the other.

---

## ✦ Deployment

Deploys to [Zerops](https://zerops.io) as two services from one repository. The
database stays on Neon and object storage on R2 — Zerops runs the code, not the
data.

```bash
npm i -g @zerops/zcli
zcli login <your-personal-access-token>
zcli push
```

Create two **Node.js 22** services named exactly `backend` and `frontend` — the
names matter, because `${backend_zeropsSubdomain}` only resolves if they match.
Set secrets in the Zerops GUI; [`zerops.yml`](zerops.yml) deliberately contains
none.

Full walkthrough, including first-deploy seeding and custom domains:
**[`specs/DEPLOYMENT.md`](specs/DEPLOYMENT.md)**.

---

## ✦ Documentation

| Read | For |
|---|---|
| **[`specs/modules/`](specs/modules/00-OVERVIEW.md)** | **Every file explained**, written for someone new to the codebase |
| [`specs/IMPORTANT.md`](specs/IMPORTANT.md) | The invariants that keep payroll trustworthy |
| [`specs/PROJECT_STATUS.md`](specs/PROJECT_STATUS.md) | What works today, verified against the live database |
| [`specs/DEPLOYMENT.md`](specs/DEPLOYMENT.md) | Deploying to Zerops |

New here? Start with
**[`specs/modules/00-OVERVIEW.md`](specs/modules/00-OVERVIEW.md)** — it explains
the whole system, then walks through every module in order. Thirteen files, no
framework knowledge assumed.

---

## ✦ Troubleshooting

<details>
<summary><b>The web app loads but every request fails</b></summary>

<br />

Almost always one of two things:

1. **`CORS_ORIGIN` does not include the frontend's URL.** It is comma-separated;
   add every origin that will call the API.
2. **`NEXT_PUBLIC_API_URL` was wrong at build time.** It is baked into the
   browser bundle during `next build` — changing it afterwards does nothing.

</details>

<details>
<summary><b><code>npm ci</code> fails with "Missing: typescript@5.9.3 from lock file"</b></summary>

<br />

`tsconfck` (pulled in by `vite-tsconfig-paths`) peers TypeScript `^5` while the
backend is on `^6`, so an older npm insists on a nested `typescript@5.9.3` that
the lock — generated by npm 11 — does not carry.

Use `npm install` instead. It honours the lock for every version it can and
resolves that one conflict for whichever npm you are running. `zerops.yml`
already does this.

</details>

<details>
<summary><b>The API exits with <code>Cannot find module dist/main</code></b></summary>

<br />

`npm run build` was run while `npm run start:dev` was watching — the build
rewrote `dist/` underneath it. Stop the watcher, build, then restart.

</details>

<details>
<summary><b><code>prisma generate</code> fails with EPERM on Windows</b></summary>

<br />

A running server holds the query engine DLL open. Stop the backend and retry:

```bash
npx prisma generate
```

</details>

<details>
<summary><b>A payrun computes everyone to zero pay</b></summary>

<br />

**Correct behaviour, not a bug.** Pro-rating uses attendance, so an employee
with no attendance records in the period worked no days. Capture attendance for
the period first — `npm run seed:demo` creates about six months of it.

</details>

<details>
<summary><b>Validation is blocked with <code>BLOCKING_WARNINGS</code></b></summary>

<br />

Also correct. Something in the payrun cannot be paid:

- `NO_ACTIVE_CONTRACT` — no `RUNNING` contract covers the period
- `MISSING_BANK_DETAILS` — nowhere to send the money

Fix the data. Do not add a bypass.

</details>

<details>
<summary><b>Pages take 1–2 seconds to load</b></summary>

<br />

Neon is remote — a round-trip costs roughly 290 ms, so **query count, not query
complexity, is what makes a page slow**. Three rules:

- Never `await` independent queries in sequence; use `Promise.all`.
- Never query inside a loop over rows. Read once, group in memory.
- Each Prisma `include` is another round-trip — `select` only what you render.

Applying the first two took the dashboard KPI endpoint from 5.4 s to 1.5 s.

</details>

---

<div align="center">
<sub>Built with NestJS, Next.js, Prisma and Neon.</sub>
</div>
