# 00 · Overview — start here

This folder explains **every file in Odoo PNX**: what it does, which feature it
belongs to, what it talks to, and why it is written the way it is.

You do not need to know NestJS or Next.js to follow along. Where a framework
concept appears, it is explained the first time.

## Read them in this order

| # | File | What it covers |
|---|---|---|
| 00 | This file | The big picture and how a request flows |
| [01](01-DATABASE.md) | Database | Every table, every relationship, and why |
| [02](02-BACKEND-CORE.md) | Backend core | Boot, guards, interceptors, error handling |
| [03](03-AUTH-USERS.md) | Auth & Users | Signing in, tokens, accounts, permissions |
| [04](04-EMPLOYEES-DEPARTMENTS.md) | Employees & Departments | The people, and department heads |
| [05](05-CONTRACTS-SCHEDULES.md) | Contracts & Schedules | Terms of employment and rosters |
| [06](06-ATTENDANCE-TIMEOFF.md) | Attendance & Time off | Who was at work |
| [07](07-PAYROLL.md) | Payroll | The rule engine, payruns, payslips, PDFs |
| [08](08-DASHBOARD.md) | Dashboard | Live figures and charts |
| [09](09-FRONTEND-CORE.md) | Frontend core | The shell, data layer, state |
| [10](10-FRONTEND-PAGES.md) | Frontend pages | Every screen, one by one |
| [11](11-UI-KIT.md) | UI kit | Design system and reusable components |
| [12](12-SEEDS-SCRIPTS-TESTS.md) | Seeds, scripts, tests | Demo data and how it is verified |

---

## What the product does

It runs HR and payroll for a company:

- keeps a directory of **employees** and the **departments** they belong to,
- records each employee's **contract** — their wage, and the **working schedule**
  (which days and hours) they are rostered for,
- tracks **attendance** (check in, check out) and **time off** (leave requests
  drawn from allocations),
- and runs **payroll**: a payrun gathers eligible employees for a month, a rule
  engine computes each payslip line by line, and the result is frozen as a
  permanent record with a PDF.

The interesting part is that **payroll is genuinely computed**. Salary is not a
number someone types in. It is derived from the contract wage, the days actually
worked, and an ordered list of salary rules.

---

## The two halves

```
people_pay/
├── backend/    The API and all business logic  → http://localhost:4000/api/v1
├── frontend/   The web app the user clicks     → http://localhost:3000
└── specs/      Documentation (you are here)
```

**They are separate programs.** The frontend has no database access at all — it
can only ask the API. That matters for security: every rule lives in the
backend, because that is the only place a user cannot bypass.

| | Backend | Frontend |
|---|---|---|
| Framework | NestJS | Next.js (App Router) |
| Language | TypeScript | TypeScript |
| Talks to | Neon Postgres (via Prisma), Cloudflare R2 | The backend, over HTTPS |
| Job | Decide and store | Display and collect |

---

## How one request flows

Say an HR user clicks **Approve** on a leave request. Here is the whole path.

### 1. The browser

```
frontend/src/app/(dashboard)/time-off/requests/page.tsx
```
The page renders a table. The Approve button calls a **mutation** from the data
layer.

```
frontend/src/hooks/use-resources.ts     → useDecideTimeOffRequest()
frontend/src/lib/api/client.ts          → axios PATCH with the access token
```

### 2. Over the wire

```
PATCH http://localhost:4000/api/v1/time-off/requests/<id>/approve
Authorization: Bearer <access token>
```

### 3. The backend, in order

| Step | File | What it does |
|---|---|---|
| 1 | `common/guards/jwt-auth.guard.ts` | Is this token valid? Who is it? |
| 2 | `common/guards/abilities.guard.ts` | Is this role allowed to update leave? |
| 3 | `common/pipes/validation.pipe.ts` | Is the body shaped correctly? |
| 4 | `time-off/requests/time-off-requests.controller.ts` | Routes to the handler |
| 5 | `time-off/requests/time-off-requests.service.ts` | The actual work |
| 6 | `prisma/prisma.service.ts` | Talks to Neon Postgres |
| 7 | `common/interceptors/transform.interceptor.ts` | Wraps the reply as `{ data }` |
| 8 | `common/filters/all-exceptions.filter.ts` | If anything threw, turns it into a clean error |

Step 5 is where the real rule lives: approving a request **also debits the
employee's allocation, inside one database transaction**, so a balance can never
drift away from the requests that consumed it.

### 4. Back in the browser

The mutation invalidates the cached queries it affected — the request list, the
allocations, the dashboard — so every part of the screen showing that data
refetches on its own. Nobody has to remember to refresh anything.

---

## The five ideas that explain most of the code

**1. The API is the only security boundary.**
The frontend also knows the permission rules (`frontend/src/lib/abilities`), but
only so it can hide buttons you cannot use. Deleting that file would change what
you *see*, never what you can *do*.

**2. Every response has the same shape.**
`{ data: ..., meta?: ... }`. One interceptor enforces it, so every function that
reads the API was written once, against one shape.

**3. Errors carry a code.**
Not just a message — a machine-readable `code` like `OVERLAPPING_CONTRACT` or
`INSUFFICIENT_BALANCE`, so the UI can say something precise.

**4. A payslip is a snapshot, not a view.**
Every computed line is stored. Changing a salary rule next month cannot rewrite
what someone was already paid. Payroll records are legal documents.

**5. Some authority is a relationship, not a role.**
A "department head" is an ordinary employee that `Department.headId` points at.
They can approve leave for their own department. No role can express that, so
the code checks the relationship per record.

---

## Vocabulary

Terms used throughout, in plain language.

| Term | Meaning |
|---|---|
| **Module** | A NestJS folder grouping a feature: controller + service + DTOs |
| **Controller** | Maps URLs to functions. Contains no logic |
| **Service** | The actual business logic. Where decisions are made |
| **DTO** | "Data Transfer Object" — the shape and rules for an incoming request body |
| **Guard** | Runs before a handler and can reject the request (auth, permissions) |
| **Interceptor** | Wraps a handler to change what goes out (or log it) |
| **Prisma** | The library that turns TypeScript calls into SQL |
| **Schema** | `backend/prisma/schema.prisma` — the single definition of every table |
| **Payrun** | One payroll cycle: a month, a set of employees, and their payslips |
| **Payslip** | One employee's pay for one payrun, with every line stored |
| **Allocation** | A balance of leave days granted to an employee |
| **CASL** | The library that answers "may this role do this?" |
| **Hook** | A React function starting with `use` that components call for data or state |
