# 07 · Payroll

The heart of the product. Salary is **computed**, not typed in.

---

## The files

| File | Purpose |
|---|---|
| `src/payroll/rule-engine/rule-engine.service.ts` | **Runs the salary rules** |
| `src/payroll/salary-structures/*` | A named list of rules |
| `src/payroll/salary-rules/*` | One rule, plus formula validation |
| `src/payroll/payruns/payruns.controller.ts` | Payrun routes |
| `src/payroll/payruns/payruns.service.ts` | Scope preview, the state machine |
| `src/payroll/payruns/dto/create-payrun.dto.ts` | Name, period, structure, employees |
| `src/payroll/payruns/dto/preview-scope.dto.ts` | "Who is eligible?" |
| `src/payroll/payslips/payslip-computation.service.ts` | **Computes one payslip** |
| `src/payroll/payslips/payslips.service.ts` | Reading, explaining, recomputing |
| `src/payroll/payslips/payslip-pdf.service.ts` | Renders a PDF with Puppeteer |

---

## The model

```
SalaryStructure ── SalaryRule (ordered by `sequence`)
       │
    Payrun (a month + a set of employees)
       │
    Payslip ── PayslipLine (one row per rule result)
```

---

## Salary rules

A structure is an **ordered list**. Each rule has a `code` that later rules refer
to, a `sequence` that fixes the order, and a computation type.

The seeded structure:

| Seq | Code | Category | Computation | On a ₹50,000 wage |
|---|---|---|---|---|
| 1 | `BASIC` | BASIC | `basicWage * (workedDays / totalDays)` | 50,000.00 |
| 2 | `HRA` | ALLOWANCE | 40% of `BASIC` | 20,000.00 |
| 3 | `PF` | DEDUCTION | 12% of `BASIC` | 6,000.00 |
| 4 | `GROSS` | GROSS | `BASIC + HRA` | 70,000.00 |
| 5 | `NET` | NET | `GROSS - PF` | **64,000.00** |

> **`BASIC` derives from the contract wage.** It used to be a fixed ₹50,000, so
> every employee was paid identically regardless of their contract. If you ever
> see a `FIXED` amount on `BASIC`, that is the bug returning.

---

## The rule engine

```ts
run(rules: SalaryRule[], baseContext: BaseContext): RuleEngineResult {
  const context: RuleContext = {
    basicWage: baseContext.basicWage,
    workedDays: baseContext.workedDays,
    totalDays: baseContext.totalDays,
    BASIC: baseContext.basicWage,
  };

  const sorted = [...rules].sort((a, b) => a.sequence - b.sequence);

  for (const rule of sorted) {
    if (!rule.active) continue;
    if (rule.condition && !this.evalCondition(rule.condition, context)) continue;

    const value = this.computeRule(rule, context);
    context[rule.code] = value;         // ← later rules can now use it
    lines.push({ ruleCode: rule.code, label: rule.name, category: rule.category,
                 amount: value, sequence: rule.sequence });
  }

  return { context, lines };
}
```

**The shared context is the whole idea.** Each result is written back under its
rule's code, so rule 4 can say `BASIC + HRA` because rules 1 and 2 already ran.
That is why `sequence` matters: a rule referring to something computed later
fails with a clear message telling you to check the order.

### Three computation types

```ts
case 'FIXED':      return rule.amount;
case 'PERCENTAGE': return context[rule.percentageOf] * (rule.percentageValue / 100);
case 'FORMULA':    return this.evalSafe(rule.formula, context);
```

### Formulas are sandboxed

Formulas come from the database, which means from a user. Running them naively
would be remote code execution.

**Never `eval`.** A dedicated mathjs instance is used, with its runtime
extension points disabled:

```ts
this.math.import({
  import: () => { throw new Error('import is disabled in salary formulas'); },
  createUnit: () => { throw new Error('createUnit is disabled in salary formulas'); },
}, { override: true });
```

…plus a token blocklist and a length cap:

```ts
const FORBIDDEN_TOKENS = ['import', 'createUnit', 'evaluate', 'parse', 'compile',
  'constructor', 'prototype', '__proto__', 'process', 'require', 'globalThis', …];
```

And the scope is **copied** before evaluation:

```ts
return this.math.evaluate(expression, { ...scope });
```

mathjs writes assignments back into the scope it is given. Without the copy, a
formula could mutate the shared context and change other rules' results.

`POST /payroll/rules/validate` runs the same checks so the UI can tell an author
their formula is wrong *before* it reaches a payslip.

---

## The payrun state machine

```
DRAFT → COMPUTING → COMPUTED → VALIDATED → PAID
                         ↘ ERROR
```

| Transition | Endpoint | Guard |
|---|---|---|
| create | `POST /payroll/payruns` | Period must be valid |
| compute | `POST /payroll/payruns/:id/compute` | Not already `PAID` |
| validate | `POST /payroll/payruns/:id/validate` | **No blocking warnings** |
| mark paid | `POST /payroll/payruns/:id/mark-paid` | Must be `VALIDATED` |

**A `PAID` payrun is immutable.** No recompute, no re-validate, no edit. It is
a record of money that left the company.

### Preview the scope first

```ts
const contractFilter = {
  status: 'RUNNING' as const,
  startDate: { lte: periodEnd },
  OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
};
```

`POST /payroll/payruns/preview-scope` answers "who is payable for this period?"
before anything is created — the "which contract applied then?" question again.

### Blocking warnings

```ts
throw new BadRequestException({
  message: 'Resolve the blocking warnings before validating this payrun.',
  code: 'BLOCKING_WARNINGS',
  errors: warnings,
});
```

Two things block validation:

| Code | Meaning |
|---|---|
| `NO_ACTIVE_CONTRACT` | No `RUNNING` contract covers the period |
| `MISSING_BANK_DETAILS` | Nowhere to send the money |

> This guard is not decoration. It fired during testing and correctly refused to
> pay an employee with no contract. **Do not add a bypass.**

---

## Computing one payslip

`payslip-computation.service.ts`, in order:

**1. Resolve the contract for the period.** No contract → a blocking warning,
and the payslip stops there.

**2. Work out worked days and rostered days.**

```ts
const attendedDays = new Set(attendances.map((a) => a.checkIn.toISOString().slice(0, 10)));
const paidLeaveDays = approvedLeave
  .filter((request) => !request.timeOffType.affectsPayroll)
  .reduce((sum, request) => sum + request.duration, 0);

const workedDays = Math.min(totalDays, attendedDays.size + paidLeaveDays);
```

`totalDays` counts the days the **contract's schedule rosters**:

```ts
let rosteredDays = new Set([0, 1, 2, 3, 4]);   // Mon–Fri by default
if (workingScheduleId) {
  const lines = await this.prisma.workingScheduleLine.findMany({ where: { scheduleId: workingScheduleId } });
  if (lines.length > 0) rosteredDays = new Set(lines.map((line) => line.dayOfWeek));
}

let count = 0;
const cursor = new Date(periodStart);
while (cursor <= periodEnd) {
  if (rosteredDays.has((cursor.getDay() + 6) % 7)) count += 1;
  cursor.setDate(cursor.getDate() + 1);
}
return Math.max(1, count);   // never zero: something divides by this
```

> **This was a real bug.** `totalDays` used to count *calendar* days (~30) while
> `workedDays` could only ever count *working* days (~22). Perfect attendance
> paid 73% of the contract wage — every employee quietly docked a quarter of
> their salary. A full month must produce a ratio of exactly 1.0.

**3. Run the engine** with `{ basicWage, workedDays, totalDays }`.

**4. Derive gross and net.** An explicit `GROSS`/`NET` rule wins — the structure's
author said what those mean. Otherwise the categories are summed.

**5. Store everything, atomically.**

```ts
await this.prisma.$transaction([
  // A recompute must fully replace the previous snapshot, not append to it.
  this.prisma.payslipLine.deleteMany({ where: { payslipId: payslip.id } }),
  this.prisma.payslip.update({ where: { id: payslip.id }, data: { …, lines: { create: lines } } }),
]);
```

Every line is persisted. **That is what makes a payslip a snapshot** — editing a
salary rule next month cannot rewrite what someone was already paid.

---

## Explaining a payslip

`GET /payroll/payslips/:id/explain` turns the stored lines into sentences:

```json
{
  "summary": "For September 2026, you worked 4 day(s). Your gross pay is ₹10,436.36 and your net take-home is ₹9,541.82.",
  "steps": [
    "Basic Salary is ₹7,454.55, the base your other components are calculated from.",
    "House Rent Allowance adds ₹2,981.82 on top of your basic pay.",
    "Provident Fund takes ₹894.55 off your gross pay.",
    "That brings your gross pay to ₹10,436.36.",
    "After deductions, your net take-home is ₹9,541.82."
  ]
}
```

Built from the **stored lines**, not recomputed — so the explanation always
matches what was actually paid.

---

## PDFs

`payslip-pdf.service.ts` renders HTML and prints it with Puppeteer (headless
Chrome). Real layout, real typography, no PDF-drawing library.

| Endpoint | Does |
|---|---|
| `GET /payroll/payslips/:id/pdf` | Generate, upload to R2, return the key |
| `GET /payroll/payslips/:id/pdf/download` | Stream the file to the browser |

The app serves PDFs through its own **authenticated** download endpoint rather
than a public bucket URL, so a payslip link cannot be forwarded to someone who
should not see it.

Without R2 configured, the PDF streams inline instead. The feature degrades.
