# PeoplePay360 Backend

A comprehensive HR & Payroll Management System backend built with NestJS, TypeScript, PostgreSQL, and Prisma.

## Features

- **Authentication & Authorization**: JWT-based auth with role-based access control (RBAC) using CASL
- **Employee Management**: Full CRUD with Kanban/List views, smart-button endpoints for related data
- **Contract Management**: Overlap prevention, period-correct contract resolution
- **Working Schedules**: Flexible scheduling with auto-calculated weekly hours
- **Attendance Tracking**: Check-in/check-out, manual corrections, status detection
- **Time Off Management**: Types, allocations, requests with approval workflow and balance tracking
- **Payroll Engine**: Configurable salary rules with formula-based calculations
- **Payrun Processing**: Two-step wizard, background job processing, status workflow
- **Payslip Generation**: PDF generation, email delivery, historical snapshots
- **Dashboard Analytics**: Real-time KPIs, salary trends, attendance/time-off overviews
- **File Storage**: Cloudflare R2 integration for payslip PDFs
- **Error Tracking**: Sentry integration for production monitoring
- **API Documentation**: Swagger/OpenAPI documentation

## Tech Stack

- **Framework**: NestJS (Node.js + TypeScript)
- **Database**: PostgreSQL 16
- **ORM**: Prisma
- **Cache/Queue**: Redis + BullMQ
- **Auth**: JWT (access + refresh tokens) with Passport
- **RBAC**: CASL (attribute + role-based access control)
- **File Storage**: Cloudflare R2 (S3-compatible)
- **PDF Generation**: Puppeteer
- **Email**: Resend
- **Monitoring**: Sentry
- **Validation**: class-validator + class-transformer
- **API Docs**: Swagger/OpenAPI

## Prerequisites

- Node.js 18+ 
- PostgreSQL 16
- Redis
- npm or yarn

## Installation

1. Clone the repository and navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/peoplepay360
JWT_ACCESS_SECRET=your-super-secret-access-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
REDIS_URL=redis://localhost:6379

# Cloudflare R2 (S3-compatible)
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=peoplepay360-files
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://files.yourdomain.com

RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=payroll@yourdomain.com

SENTRY_DSN=your-sentry-dsn
SENTRY_ENVIRONMENT=development
SENTRY_TRACES_SAMPLE_RATE=1.0

CORS_ORIGIN=http://localhost:3000
```

4. Set up the database:
```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# (Optional) Seed the database
npx prisma db seed
```

## Running the Application

### Development Mode
```bash
npm run start:dev
```

### Production Mode
```bash
# Build the application
npm run build

# Start the production server
npm run start:prod
```

The API will be available at `http://localhost:4000`

## API Documentation

Once the server is running, access the Swagger documentation at:
```
http://localhost:4000/api/docs
```

## Project Structure

```
src/
├── main.ts                    # Application entry point
├── app.module.ts              # Root module
├── common/                    # Shared utilities
│   ├── decorators/           # Custom decorators (@CurrentUser, @Public, etc.)
│   ├── guards/               # Auth guards (JwtAuthGuard, AbilitiesGuard)
│   ├── filters/              # Exception filters
│   ├── interceptors/         # Logging and transformation interceptors
│   ├── pipes/                # Validation pipes
│   └── abilities/            # CASL ability definitions
├── config/                   # Configuration files
├── auth/                     # Authentication module
├── users/                    # User management
├── employees/                # Employee management
├── departments/              # Department management
├── contracts/                # Contract management
├── working-schedules/        # Working schedule management
├── attendance/               # Attendance tracking
├── time-off/                 # Time off management
│   ├── types/               # Time off types
│   ├── allocations/         # Time off allocations
│   └── requests/            # Time off requests
├── payroll/                  # Payroll module
│   ├── salary-structures/   # Salary structures
│   ├── salary-rules/        # Salary rules
│   ├── rule-engine/         # Rule calculation engine
│   ├── payruns/             # Payrun management
│   └── payslips/            # Payslip management
├── dashboard/                # Dashboard analytics
├── files/                    # File storage service
├── jobs/                     # Background job processing
└── prisma/                   # Prisma service
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password

### Users (Admin only)
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `PATCH /api/users/:id` - Update user
- `DELETE /api/users/:id` - Deactivate user

### Employees
- `GET /api/employees` - List employees (supports kanban/list views)
- `GET /api/employees/:id` - Get employee details
- `POST /api/employees` - Create employee
- `PATCH /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee
- `GET /api/employees/:id/contracts` - Get employee contracts
- `GET /api/employees/:id/attendance` - Get employee attendance
- `GET /api/employees/:id/time-off` - Get employee time off
- `GET /api/employees/:id/timeline` - Get employee timeline

### Departments
- `GET /api/departments` - List departments
- `POST /api/departments` - Create department
- `PATCH /api/departments/:id` - Update department
- `DELETE /api/departments/:id` - Delete department

### Contracts
- `GET /api/contracts` - List contracts
- `GET /api/contracts/active` - Get active contract for employee
- `POST /api/contracts` - Create contract
- `PATCH /api/contracts/:id` - Update contract
- `DELETE /api/contracts/:id` - Delete contract

### Working Schedules
- `GET /api/working-schedules` - List working schedules
- `POST /api/working-schedules` - Create working schedule
- `PATCH /api/working-schedules/:id` - Update working schedule
- `DELETE /api/working-schedules/:id` - Delete working schedule

### Attendance
- `GET /api/attendance` - List attendance records
- `GET /api/attendance/widget/today` - Get today's attendance widget
- `POST /api/attendance/check-in` - Check in
- `POST /api/attendance/:id/check-out` - Check out
- `PATCH /api/attendance/:id` - Manual correction

### Time Off
- `GET /api/time-off/types` - List time off types
- `POST /api/time-off/types` - Create time off type
- `GET /api/time-off/allocations` - List allocations
- `POST /api/time-off/allocations` - Create allocation
- `PATCH /api/time-off/allocations/:id/approve` - Approve allocation
- `GET /api/time-off/requests` - List requests
- `POST /api/time-off/requests` - Create request
- `PATCH /api/time-off/requests/:id/approve` - Approve request
- `PATCH /api/time-off/requests/:id/refuse` - Refuse request

### Payroll
- `GET /api/payroll/structures` - List salary structures
- `POST /api/payroll/structures` - Create salary structure
- `GET /api/payroll/structures/:id/rules` - List salary rules
- `POST /api/payroll/structures/:id/rules` - Create salary rule
- `POST /api/payroll/rules/validate` - Validate salary rule formula
- `POST /api/payroll/payruns/preview-scope` - Preview payrun scope
- `POST /api/payroll/payruns` - Create payrun
- `POST /api/payroll/payruns/:id/compute` - Compute payrun
- `POST /api/payroll/payruns/:id/validate` - Validate payrun
- `POST /api/payroll/payruns/:id/mark-paid` - Mark payrun as paid
- `POST /api/payroll/payruns/:id/send-payslips` - Send payslips
- `GET /api/payroll/payslips` - List payslips
- `GET /api/payroll/payslips/:id` - Get payslip details
- `GET /api/payroll/payslips/:id/pdf` - Get payslip PDF
- `POST /api/payroll/payslips/:id/recompute` - Recompute payslip

### Dashboard
- `GET /api/dashboard/kpis` - Get dashboard KPIs
- `GET /api/dashboard/salary-cost-by-department` - Get salary cost by department
- `GET /api/dashboard/monthly-net-salary-trend` - Get monthly salary trend
- `GET /api/dashboard/payslip-status-breakdown` - Get payslip status breakdown
- `GET /api/dashboard/alerts` - Get payroll alerts
- `GET /api/dashboard/attendance-overview` - Get attendance overview
- `GET /api/dashboard/time-off-overview` - Get time off overview
- `GET /api/dashboard/department-overview` - Get department overview

## User Roles

The system supports the following roles with different permissions:

- **EMPLOYEE**: Can view own attendance, create time off requests, view own payslips
- **HR_MANAGER**: Can manage employees, contracts, schedules, attendance, time off
- **HR_PAYROLL_USER**: Can manage HR data + read/create/update payruns and payslips
- **HR_PAYROLL_MANAGER**: Full payroll management including salary structures and rules
- **ADMIN**: Full system access

## Payroll Workflow

The payroll system follows this workflow:

1. **Draft** - Initial state after payrun creation
2. **Computing** - Background computation in progress
3. **Computed** - Computation complete, ready for review
4. **Validated** - Validated and ready for payment
5. **Paid** - Payment completed, payslips become immutable

## Database Schema

The database schema is defined in `prisma/schema.prisma` and includes:

- Users, Employees, Departments
- Contracts, Working Schedules
- Attendance records
- Time Off Types, Allocations, Requests
- Salary Structures, Salary Rules
- Payruns, Payslips, Payslip Lines

## Testing

```bash
# Run unit tests
npm run test

# Run e2e tests
npm run test:e2e

# Run tests with coverage
npm run test:cov
```

## Development Notes

- The API uses JWT tokens for authentication. Include the token in the `Authorization` header: `Bearer <token>`
- All list endpoints support pagination with `page` and `limit` query parameters
- All list endpoints support search with `search` query parameter
- All list endpoints support sorting with `sort` query parameter (format: `field:direction`)
- All list endpoints return `{ data: [], meta: { total, page, limit } }`
- The API uses standard HTTP status codes and returns detailed error messages

## Production Deployment

1. Set environment variables for production
2. Build the application: `npm run build`
3. Run database migrations: `npx prisma migrate deploy`
4. Start the application: `npm run start:prod`
5. Ensure Redis and PostgreSQL are running and accessible
6. Configure Sentry for error monitoring
7. Set up Cloudflare R2 for file storage
8. Configure Resend for email delivery

## License

Proprietary - All rights reserved

## Support

For support and questions, please contact the development team.
