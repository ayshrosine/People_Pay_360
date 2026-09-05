# 02 · Backend core

The plumbing every feature sits on: how the server boots, and the four pieces
that run around **every** request.

---

## The files

| File | Purpose |
|---|---|
| `src/main.ts` | Boots the server: CORS, URL prefix, Swagger |
| `src/app.module.ts` | Wires every module together and registers the global pieces |
| `src/app.controller.ts` / `app.service.ts` | Health check |
| `src/config/env.validation.ts` | Refuses to start with bad configuration |
| `src/prisma/prisma.module.ts` / `prisma.service.ts` | The database connection |
| `src/common/guards/` | Authentication and permissions |
| `src/common/interceptors/` | Response shape, logging, error context |
| `src/common/filters/all-exceptions.filter.ts` | Turns any error into a clean JSON reply |
| `src/common/pipes/validation.pipe.ts` | Validates incoming bodies |
| `src/common/abilities/` | Who is allowed to do what |
| `src/common/decorators/` | The little `@` labels used on controllers |
| `src/files/files.service.ts` | Uploads to Cloudflare R2 |
| `src/jobs/jobs.module.ts` | The optional background queue |

---

## Booting — `src/main.ts`

Four things happen, in order:

**1. Sentry, before anything else.**
```ts
if (process.env.SENTRY_DSN) { Sentry.init({ ... }); }
```
It has to patch the runtime before Nest builds the app. Without a DSN it is
skipped entirely — error tracking is optional.

**2. CORS.** A browser will not let the web app call the API unless the API says
that origin is allowed.
```ts
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
```
Comma-separated, so local development and the deployed site can both be listed.
**If the app loads but every request fails, check this first.**

**3. A URL prefix.** `app.setGlobalPrefix('api/v1')` — every route is under
`/api/v1`, so the API can be versioned later without breaking anyone.

**4. Swagger.** Live, browsable documentation generated from the code itself at
`http://localhost:4000/api/docs`. Use it to try endpoints without writing any
code.

---

## Wiring — `src/app.module.ts`

A NestJS module lists what it *imports* (other modules) and *provides*
(services). `AppModule` is the root: it imports every feature module and
registers the global machinery.

```ts
{ provide: APP_GUARD, useClass: JwtAuthGuard },
{ provide: APP_GUARD, useClass: AbilitiesGuard },
```

> **Order matters.** `JwtAuthGuard` authenticates and puts the user on the
> request; `AbilitiesGuard` then reads that user to check permissions. Reversed,
> there would be no user to check.

```ts
{ provide: APP_PIPE, useValue: new ValidationPipe({ ... }) }
```

> This was once registered under the *string* `'APP_PIPE'` instead of the token
> exported by `@nestjs/core`. Nest silently ignored it, so **no DTO validation
> ran at all** for a while. The lesson: register global providers with the
> imported token, never a string that looks like it.

---

## Configuration — `src/config/env.validation.ts`

Checks environment variables at startup. If `DATABASE_URL` is missing or a JWT
secret is too short, the server **refuses to boot** with a clear message.

That is deliberate. A server that starts with broken configuration fails later,
at request time, in a confusing way.

Only three variables are required: `DATABASE_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`. Redis, R2, Resend and Sentry are optional and each
degrades explicitly.

---

## The database connection — `src/prisma/prisma.service.ts`

Extends `PrismaClient` and connects when the module starts. It is **global**, so
any service can inject it:

```ts
constructor(private prisma: PrismaService) {}
```

Every database call in the whole backend goes through this one object.

---

## What runs around every request

```
Request
  │
  ├─ 1. JwtAuthGuard          Who are you?              → 401 if invalid
  ├─ 2. AbilitiesGuard        May you do this?          → 403 if not
  ├─ 3. ValidationPipe        Is the body correct?      → 400 if not
  │
  ├──── your controller → your service → Prisma → Neon
  │
  ├─ 4. TransformInterceptor  Wrap as { data, meta? }
  ├─ 5. LoggingInterceptor    Record method, path, status, duration
  └─ 6. AllExceptionsFilter   Anything thrown → clean JSON with a code
                                                        → Response
```

### 1. `JwtAuthGuard`

Reads the `Authorization: Bearer <token>` header and verifies it. Routes marked
`@Public()` skip it — that is how `/auth/login` is reachable without a token.

On success it attaches the user to the request:

```ts
export interface RequestUser {
  id: string;
  email: string;
  role: RoleName;
  employeeId: string | null;
}
```

### 2. `AbilitiesGuard` + `AbilityFactory`

`AbilityFactory` builds a **CASL ability** from the user's role — a list of what
that role can do. The guard checks the requirement a controller declared:

```ts
@CheckAbility({ action: 'read', subject: 'Payrun' })
```

> Two real bugs lived here. `createMongoAbility` was being *invoked* instead of
> passed as a factory, which produced an ability with no rules — so every check
> silently passed. And the guard itself was never registered. Both are fixed;
> the test suite now proves each role is denied what it should be.

The guard also knows about **department heads**. A handler can add
`@AllowDepartmentHead()`, which lets a head past the role check so the handler
can decide per record:

```ts
if (allowsDepartmentHead && (await this.departmentHeads.isHeadOfAnyDepartment(user))) {
  return true;
}
```

> **This grants nothing on its own.** A handler carrying that decorator *must*
> then call `assertLeads(...)` or `assertMayDecide(...)`, or it is an open
> endpoint. See [04](04-EMPLOYEES-DEPARTMENTS.md).

### 3. `ValidationPipe`

Checks the request body against its DTO class. `whitelist: true` strips unknown
fields; `forbidNonWhitelisted: true` rejects them outright. Failures come back
field by field:

```json
{ "code": "VALIDATION_FAILED",
  "errors": [{ "field": "email", "constraints": ["email must be an email"] }] }
```

### 4. `TransformInterceptor`

Wraps every successful reply as `{ data }` — or passes it through untouched if
the service already returned `{ data, meta }` for a paginated list.

```ts
if (payload === undefined) return payload;   // a genuine 204, no body
if (payload === null) return { data: null }; // "nothing today" is still an answer
```

> That second line was a real bug. Returning bare `null` produced an **empty
> response body**, which every client read as `undefined` — and TanStack Query
> throws on `undefined`. `null` means "there is no attendance record today" and
> has to survive the trip.

### 5. `LoggingInterceptor`

Logs method, path, status and duration. When something is slow, this is where
you look first.

### 6. `AllExceptionsFilter`

Catches everything and produces one consistent error shape:

```json
{
  "statusCode": 409,
  "message": "This employee already has a running contract for that period.",
  "code": "OVERLAPPING_CONTRACT",
  "timestamp": "2026-09-05T…",
  "path": "/api/v1/contracts"
}
```

The `code` is the important field: the UI branches on it to show a precise
inline message instead of a generic toast. **When you add an error, give it a
code.**

---

## Decorators — `src/common/decorators/`

Small labels that attach information to a route.

| Decorator | Meaning |
|---|---|
| `@Public()` | Skip authentication (only `/auth/login`, `/auth/refresh`) |
| `@CheckAbility({ action, subject })` | The permission required |
| `@AllowDepartmentHead()` | Let a department head past the role check — the handler must then authorise the record |
| `@CurrentUser()` | Injects the signed-in user into a handler parameter |

---

## Row-level scoping — `src/common/guards/scope.util.ts`

Permissions answer *"may this role read employees?"*. They do **not** answer
*"may this role read **this** employee?"* — a different question with a
different answer.

Self-service roles have their list queries narrowed to their own records, so an
`EMPLOYEE` listing employees sees exactly one row: themselves. Without this,
every employee could read every colleague's bank details while passing the
permission check perfectly.

---

## File storage — `src/files/files.service.ts`

Uploads payslip PDFs to **Cloudflare R2** using the AWS S3 client, because R2
speaks the S3 protocol:

```ts
new S3Client({
  region: 'auto',                       // R2 has no regions
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: …, secretAccessKey: … },
});
```

If R2 is not configured the service says so and the PDF streams straight to the
browser instead. The feature degrades; it does not crash.

---

## Background jobs — `src/jobs/jobs.module.ts`

Optional BullMQ + Redis queue for payslip computation. **Without `REDIS_URL`,
computation runs inline** in the request instead. Slower for large payruns,
identical results, and one less service to run locally.
