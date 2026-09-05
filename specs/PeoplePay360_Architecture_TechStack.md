# PeoplePay360 — HR & Payroll Platform
## Production-Grade Architecture, Tech Stack & Experience Design

This document turns the PeoplePay360 problem statement into a concrete, buildable system: architecture, stack, data model, payroll engine design, differentiator features, and UI/UX direction — sized for a hackathon build but designed the way a real production HRMS/payroll vendor (Workday, Keka, Rippling, Zoho People) would architect it.

---

## 1. Guiding Principles

- **Employee is the hub.** Every module (Contract, Attendance, Time Off, Payroll) is a spoke that reads/writes back to the Employee's timeline.
- **Period-correctness over convenience.** Contracts, schedules, and salary structures are all *time-sliced* — payroll must resolve "what was true on this date," not "what is true now."
- **Rules over hardcoding.** Salary computation is data-driven (Salary Rules with sequence + computation type), not `if/else` in code.
- **Async by default for payroll.** Payslip computation, PDF generation, and bulk email are background jobs, never blocking HTTP requests.
- **Everything auditable.** Payroll is a finance-adjacent domain — every state transition (Draft → Computed → Validated → Paid) is logged, immutable once paid.

---

## 2. High-Level Architecture

```
                                   ┌────────────────────────┐
                                   │        Clients          │
                                   │  Web App (Next.js)      │
                                   │  Mobile (React Native)  │
                                   └───────────┬─────────────┘
                                               │ HTTPS / JSON (REST) + WebSocket
                                   ┌───────────▼─────────────┐
                                   │      API Gateway /       │
                                   │  BFF (NestJS Gateway)    │
                                   │  - AuthN/AuthZ (JWT)     │
                                   │  - Rate limiting         │
                                   │  - Request validation    │
                                   └───────────┬─────────────┘
                     ┌─────────────────────────┼───────────────────────────┐
                     │                         │                           │
          ┌──────────▼─────────┐   ┌───────────▼──────────┐    ┌───────────▼──────────┐
          │   HR Core Service   │   │  Payroll Engine Svc   │    │  Reporting/Dashboard  │
          │ Employees, Contracts│   │ Payruns, Payslips,     │    │  Service (read-model, │
          │ Schedules, Attendance│  │ Salary Rules/Structures│    │  aggregations, cache) │
          │ Time Off             │  │ PDF + Email dispatch   │    │                       │
          └──────────┬─────────┘   └───────────┬───────────┘    └───────────┬───────────┘
                     │                          │                            │
                     │        Domain events (Kafka / Redis Streams)          │
                     └─────────────┬────────────┴──────────────┬─────────────┘
                                   │                            │
                        ┌──────────▼─────────┐        ┌─────────▼──────────┐
                        │   PostgreSQL (OLTP)  │        │   Job Queue (Redis  │
                        │  - core write model  │        │   + BullMQ)         │
                        │  - row-level RBAC    │        │  - compute payslip  │
                        └──────────┬───────────┘        │  - generate PDF     │
                                   │                     │  - send email       │
                        ┌──────────▼───────────┐        └─────────┬──────────┘
                        │  Materialized views /  │                 │
                        │  read replica for      │        ┌────────▼─────────┐
                        │  Dashboard aggregates  │        │  Object Storage   │
                        └────────────────────────┘        │  (Cloudflare R2)  │
                                                            │  payslip PDFs     │
                                                            └───────────────────┘
```

**Why this shape:** a single Postgres-backed modular system (not needlessly split into 10 microservices for a hackathon) but already **service-oriented internally** — HR Core, Payroll Engine, and Reporting are separate NestJS modules with clear boundaries, so they *can* be pulled into real microservices later without a rewrite. Domain events (e.g. `AttendanceCorrected`, `LeaveApproved`, `ContractEnded`) decouple Payroll from HR so the dashboard and payroll engine never poll — they react.

### Recommended build mode for the hackathon
**Modular monolith** (one NestJS codebase, cleanly separated modules/domains, one Postgres DB) with an event bus in-process (or Redis Streams if you want to demo "real" decoupling). This gets you 90% of the architectural rigor of microservices with 10% of the deployment complexity — the right call for both hackathon judging and early production.

---

## 3. Recommended Tech Stack

| Layer | Recommendation | Why |
|---|---|---|
| **Frontend** | Next.js 15 (React 19) + TypeScript | SSR for fast dashboard loads, file-based routing for the many list/form views, great DX |
| **UI Components** | Tailwind CSS + shadcn/ui + Radix primitives | Accessible by default, fully customizable (not "another Bootstrap admin theme") |
| **State/Data** | TanStack Query (server cache) + Zustand (UI state) | Payroll UIs are data-heavy; React Query handles caching/invalidation across Employee↔Contract↔Payslip links elegantly |
| **Charts** | Recharts / Tremor | Clean dashboard charts (salary trend, dept cost) matching the mockup style |
| **Backend** | NestJS (Node.js + TypeScript) | Modular, DI-based, matches the "Employee/Contract/Payroll/Attendance module" shape naturally; huge ecosystem (queues, cron, validation, Swagger) out of the box |
| **API style** | REST (OpenAPI/Swagger) for CRUD + a thin GraphQL layer (or REST aggregate endpoints) for the Dashboard | Simple CRUD stays simple; dashboard aggregation queries stay flexible |
| **Database** | PostgreSQL 16 | ACID guarantees for payroll money math; native `daterange`/`tstzrange` types are perfect for contract/schedule period-validity; JSONB for flexible salary-rule computation payloads |
| **ORM** | Prisma (or TypeORM if you prefer decorators) | Type-safe queries, easy migrations, great with NestJS |
| **Cache/Queue** | Redis + BullMQ | Job queue for payslip computation, PDF generation, bulk email; also caches dashboard aggregates |
| **Search (optional/prod)** | Meilisearch or Postgres full-text | Fast employee/payslip search |
| **PDF generation** | Puppeteer (HTML→PDF) or `@react-pdf/renderer` | Payslip PDFs styled with the same design system as the web app |
| **Email** | Resend / AWS SES / SendGrid | Bulk payslip delivery from Payrun |
| **Auth** | JWT (access + refresh) via NestJS Passport, bcrypt/argon2 for passwords | Matches the Login/User Access flow in your mockup; add Keycloak/Auth0 later for SSO/SAML if going enterprise |
| **RBAC** | CASL (attribute + role-based) | Cleanly expresses your 5 roles (Employee, HR Manager, HR Payroll User, HR Payroll Manager, Admin) as declarative policies, not scattered `if` checks |
| **File storage** | Cloudflare R2 (S3-compatible API) | Payslip PDFs, employee documents — zero egress fees, S3 SDK compatible so the code stays identical to a "real" S3 setup |
| **Observability** | Sentry (errors, both backend & frontend) + structured logs (pino) | Payroll bugs are expensive — you want to *see* them before users report them |

### Why NestJS + Next.js over alternatives
- **vs. Django/DRF:** Django is a fine choice too (great admin panel, ORM), but NestJS's module system maps almost 1:1 to your feature breakdown (HR module, Payroll module, Attendance module), and keeps frontend/backend in one language (TypeScript) for faster hackathon iteration and easier type-sharing (DTOs).
- **vs. Spring Boot (Java):** Spring Boot is what real enterprise payroll vendors often use for the rules engine (very mature). It's a legitimate "if we had 6 months" choice, but slower to iterate on in a hackathon timeframe.
- **vs. a no-code/low-code base (e.g., building on Odoo itself):** Your mockup is literally styled like Odoo — you could extend Odoo directly (Python/XML views, `hr_payroll` module) which is *fastest* to a working demo, but scores lower on "technical versatility" if the hackathon wants to see you build the architecture yourself.

---

## 4. Core Data Model (simplified ERD)

```
Employee ──1:N── Contract (dateRange, wage, salary_structure_id, status)
Employee ──1:1── WorkingSchedule (via active contract or direct assignment)
Employee ──1:N── Attendance (check_in, check_out, worked_hours, status)
Employee ──1:N── TimeOffRequest ──N:1── TimeOffType
Employee ──1:N── TimeOffAllocation ──N:1── TimeOffType
Employee ──N:1── Department, Manager (self-referencing)

SalaryStructure ──1:N── SalaryRule (sequence, category, computation_type, formula)
Payrun (scope, period, salary_structure_id, status) ──1:N── Payslip
Payslip ──N:1── Employee, Contract (resolved), SalaryStructure
Payslip ──1:N── PayslipLine (salary_rule_id, label, amount) [computed output]

User ──N:M── Role ──N:M── Permission   (RBAC)
```

**Key design decisions:**
- `Contract.date_range` uses Postgres `daterange` with a **GiST exclusion constraint** preventing two active contracts overlapping for the same employee — this enforces "payroll uses only the contract applicable to the period" at the *database* level, not just app logic.
- `Payslip` stores a **computed snapshot** (`PayslipLine[]`) rather than re-deriving from live Salary Rules at read-time — once paid, a payslip must never change even if the Salary Rule is edited later. This is the single most important correctness rule in payroll software.
- `TimeOffAllocation.remaining` is a **derived/materialized value**, recalculated transactionally whenever a request moves to Approved — never trust a client-sent balance.

---

## 5. The Salary Rule Engine (the heart of the system)

This is what separates a real payroll system from a form-CRUD app. Design it as a **small interpreter**, not a hardcoded formula:

```
SalaryRule {
  code: "BASIC" | "HRA" | "PF" | "NET" ...
  category: Basic | Allowance | Deduction | Gross | Net
  sequence: number          // execution order
  computation_type: FIXED | PERCENTAGE | FORMULA
  amount?: number           // for FIXED
  percentage_of?: code      // e.g. "20% of BASIC"
  formula?: string          // safe expression, e.g. "BASIC * 0.12"
  condition?: string        // optional, e.g. only if worked_days >= 20
}
```

**Execution:** rules run in `sequence` order; each rule's result is stored in a computation context keyed by `code`, so a later rule (`NET`) can reference `GROSS - DEDUCTIONS`. Use a sandboxed expression evaluator (e.g. `mathjs` or `expr-eval` — never raw `eval`) for the `FORMULA` type. This gives HR Payroll Managers a genuinely configurable engine, exactly as the PS asks ("participants are free to design the calculation engine as long as Salary Rules actually drive Payslip calculations").

**Payrun lifecycle (state machine):**
```
Draft → Computing → Computed → Validated → Paid
                 ↘ Error (missing bank details, duplicate payslip, no active contract)
```
Each transition is a guarded, logged action — `Mark Paid` should be blocked while unresolved warnings exist, mirroring real payroll compliance behavior.

---

## 6. Security & RBAC

Map your 5 roles to CASL abilities, e.g.:
```
Employee:        can(['read'], 'Attendance', { employeeId: user.id })
                  can(['create'], 'TimeOffRequest', { employeeId: user.id })
HRManager:        can(['manage'], ['Employee','Contract','Attendance','TimeOff'])
HRPayrollUser:    inherits HRManager + can(['read','create','update'], ['Payrun','Payslip'])
                                       + can('read', ['SalaryStructure','SalaryRule'])
HRPayrollManager: inherits HRPayrollUser + can('manage', ['Payrun','Payslip','SalaryStructure','SalaryRule'])
Admin:            can('manage', 'all')
```
Enforce this **both** at the API layer (guards) and reflected in the UI (hide/disable actions) — never rely on frontend-only checks for payroll data.

---

## 7. "Mind-Blowing" Differentiator Features

Pick 2–3 of these to actually build well rather than attempting all — depth beats breadth in a demo.

1. **Visual Salary Rule Builder** — instead of a form with a formula text box, give HR Payroll Managers a drag-and-drop flow (nodes for Basic → HRA → PF → Net, wired together) that compiles to the rule engine underneath. Turns the scariest part of payroll into something visually obvious.
2. **What-If Payslip Simulator** — before running a payrun, let a user pick an employee and preview "what would their payslip look like this period" instantly, live-recalculating as they tweak wage/allowance sliders. Huge wow-factor in a live demo.
3. **AI Payroll Copilot** — a chat panel ("Ask Payroll") that answers natural-language questions against your own data: *"Which employees have overlapping contracts?"*, *"Show me anyone with unpaid leave over their allocation."* Implement as a tool-calling agent over your own API (not raw DB access) so it respects RBAC.
4. **Plain-English Payslip Explainer** — on the payslip screen, a "Explain this payslip" button that turns the rule breakdown into a short human paragraph ("Your gross pay is ₹X because... your PF deduction of ₹Y is 12% of Basic..."). Great accessibility + trust feature for employees.
5. **Payroll Health Score** — a single 0–100 score on the dashboard combining attendance quality, pending time-off backlog, contract-expiry risk, and payslip warnings — the kind of "one number that matters" execs love.
6. **Anomaly Detection** — flag payslips that deviate >X% from an employee's trailing 3-month average automatically, before validation (catches data-entry payroll errors that normally surface only after employees complain).
7. **Time-travel Employee Timeline** — a single visual timeline per employee showing contracts, schedule changes, leave, and attendance overlaid — answers "what was true for this person on March 15" at a glance (directly demonstrates your period-correctness architecture).

---

## 8. UI/UX Direction

Your own mockup already leans **dark, dense, data-forward, Odoo-inspired** — lean into that rather than fighting it, but polish it into something that feels like a 2026 product, not a legacy ERP.

**Visual language**
- **Theme:** Dark-mode-first (matches your Excalidraw mock), with a true light mode toggle — not just inverted colors. Base surface `#0B0D12`, elevated cards `#12151C`, accent a confident indigo/teal (`#6366F1` or `#22D3EE`) reserved for primary actions and key KPI numbers only.
- **Typography:** Inter or Geist for UI text (excellent at small sizes for dense tables), a monospace (JetBrains Mono) for numeric columns like wages/hours so figures align visually in tables.
- **Density:** Compact, information-dense tables (your mockup's List views) but with generous spacing on Form views — dense where scanning matters, spacious where reading/editing matters.
- **Cards & KPIs:** Dashboard KPI cards use large numerals with small trend deltas (▲/▼ with color), exactly like your Payroll Dashboard sketch — keep them scannable, not decorative.

**Interaction patterns**
- **Smart buttons** on the Employee form (Contracts, Attendance, Time Off counts) — clicking opens a *filtered* list, never a fresh unfiltered screen (this is core to the "unified hub" goal in the PS).
- **Two-step wizards** (Payrun creation) as a modal stepper with a visible progress indicator — never silently jump the user forward.
- **Inline status chips** (Draft/Computed/Validated/Paid, Approved/Refused/To Approve) with consistent color coding across every module — status color = same meaning everywhere.
- **Micro-interactions:** subtle skeleton loaders (not spinners) for dashboard charts, optimistic UI updates for approvals, toast confirmations for destructive/finalizing actions (Mark Paid).
- **Accessibility:** WCAG AA contrast even in dark mode, full keyboard navigation on tables/forms, and screen-reader labels on icon-only buttons — easy to overlook, strong differentiator in judging.

**Motion**
- Framer Motion for panel transitions (opening a Payslip from a Payrun should feel like drilling in, not a hard page reload) — reinforces the "everything is connected" architecture visually.

---

## 9. Suggested Delivery Plan (hackathon-realistic)

| Phase | Scope |
|---|---|
| 1 | Auth + RBAC, Employee CRUD (Kanban/List/Form), Department/Manager |
| 2 | Contracts + Working Schedules (with overlap constraint) |
| 3 | Attendance + Time Off (types, allocations, requests, approval → balance deduction) |
| 4 | Salary Structures/Rules + rule engine interpreter |
| 5 | Payrun wizard → Payslip computation → PDF → email |
| 6 | Payroll Dashboard (real aggregates, filters) |
| 7 | One or two "mind-blowing" features (Simulator or AI Copilot) + UI polish pass |

This order matches your own dependency chain: nothing in Payroll is real until Employees, Contracts, and Salary Rules exist first.
