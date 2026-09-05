# PeoplePay360 - HR & Payroll Management System

A production-grade HR and Payroll management system built with NestJS, PostgreSQL, and Prisma.

## 🏗️ Architecture

This project follows a modular monolith architecture with clear separation of concerns:

- **HR Core**: Employees, Departments, Contracts, Working Schedules
- **Attendance**: Check-in/check-out, manual corrections, attendance tracking
- **Time Off**: Leave types, allocations, requests, approval workflow
- **Payroll**: Salary structures, rules, payruns, payslips, rule engine
- **Dashboard**: Analytics and reporting endpoints

## 🚀 Quick Start

### Prerequisites

- Node.js 24+
- PostgreSQL 16
- Redis (for job queues)
- Docker (optional, for local PostgreSQL)

### Installation

```bash
cd backend
npm install
```

### Environment Setup

Create a `.env` file in the backend directory:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/peoplepay360
JWT_ACCESS_SECRET=your-super-secret-access-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:3000
```

### Database Setup

```bash
# Start PostgreSQL (using Docker)
docker run --name peoplepay360-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=peoplepay360 -p 5432:5432 -d postgres:16

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Seed database with test data
npx prisma db seed
```

### Running the Application

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The API will be available at `http://localhost:4000/api/v1`

API documentation (Swagger): `http://localhost:4000/api/docs`

## 🧪 Testing

### Postman Collection

A comprehensive Postman collection is available for testing:

```bash
# Install Newman CLI
npm install -g newman

# Run tests
cd backend
newman run PeoplePay360_API.postman_collection.json -e PeoplePay360.postman_environment.json
```

### Test Users

The database seed creates the following test users:

- **Admin**: `admin@peoplepay360.com` / `password123`
- **HR Manager**: `hr.manager@peoplepay360.com` / `ChangeMe123!`
- **HR Payroll User**: `hrpayroll@peoplepay360.com` / `password123`
- **HR Payroll Manager**: `hrpayrollmanager@peoplepay360.com` / `password123`
- **Employees**: `john.doe@peoplepay360.com`, `jane.smith@peoplepay360.com`, `bob.wilson@peoplepay360.com` / `password123`

## 📁 Project Structure

```
people_pay/
├── backend/                 # NestJS backend application
│   ├── src/
│   │   ├── common/         # Shared utilities, guards, decorators
│   │   ├── auth/           # Authentication & JWT
│   │   ├── users/          # User management
│   │   ├── employees/      # Employee CRUD
│   │   ├── departments/    # Department management
│   │   ├── contracts/      # Contract management
│   │   ├── working-schedules/  # Working schedules
│   │   ├── attendance/     # Attendance tracking
│   │   ├── time-off/       # Leave management
│   │   ├── payroll/        # Payroll engine
│   │   ├── dashboard/      # Analytics
│   │   ├── files/          # File storage (mocked)
│   │   ├── jobs/           # Background jobs
│   │   └── prisma/         # Prisma service
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   └── seed.ts         # Database seeding
│   └── package.json
└── specs/                  # Project documentation
    ├── PeoplePay360_Architecture_TechStack.md
    ├── PeoplePay360_Backend_Guide.md
    ├── HRMS OXP - 24 hours.svg
    └── HRMS OXP - 24 hours.png
```

## 🔐 Security & RBAC

The system implements role-based access control (RBAC) with 5 roles:

1. **EMPLOYEE**: Can view own attendance, time off, and payslips
2. **HR_MANAGER**: Full access to HR modules (employees, contracts, attendance, time off)
3. **HR_PAYROLL_USER**: HR Manager + read/create/update payruns and payslips
4. **HR_PAYROLL_MANAGER**: Full payroll access including salary structures and rules
5. **ADMIN**: Full system access

## 💾 Database Schema

The database uses PostgreSQL with the following key entities:

- **Users**: Authentication and role management
- **Employees**: Employee records with department and manager relationships
- **Departments**: Organizational structure
- **Contracts**: Employment contracts with period validity
- **Working Schedules**: Weekly schedule definitions
- **Attendance**: Check-in/check-out records
- **Time Off Types**: Leave type definitions
- **Time Off Allocations**: Leave balance allocations
- **Time Off Requests**: Leave requests with approval workflow
- **Salary Structures**: Salary rule groupings
- **Salary Rules**: Computation rules (FIXED, PERCENTAGE, FORMULA)
- **Payruns**: Payroll execution periods
- **Payslips**: Generated payslips with computed line items

## 🔧 Payroll Rule Engine

The payroll system features a configurable rule engine that supports:

- **FIXED**: Fixed amount (e.g., Basic Salary: 50000)
- **PERCENTAGE**: Percentage of another rule (e.g., HRA: 40% of BASIC)
- **FORMULA**: Mathematical expressions (e.g., NET = GROSS - DEDUCTIONS)

Rules execute in sequence order, with later rules able to reference results from earlier rules.

## 📊 Dashboard Endpoints

The dashboard provides analytics endpoints:

- `/api/v1/dashboard/kpis` - Key performance indicators
- `/api/v1/dashboard/salary-cost-by-department` - Salary costs by department
- `/api/v1/dashboard/monthly-net-salary-trend` - Monthly salary trends
- `/api/v1/dashboard/payslip-status-breakdown` - Payslip status distribution
- `/api/v1/dashboard/alerts` - Payroll warnings and alerts
- `/api/v1/dashboard/attendance-overview` - Attendance statistics
- `/api/v1/dashboard/time-off-overview` - Leave statistics
- `/api/v1/dashboard/department-overview` - Department-level metrics

## 🛠️ Tech Stack

- **Backend**: NestJS (Node.js + TypeScript)
- **Database**: PostgreSQL 16
- **ORM**: Prisma
- **Cache/Queue**: Redis + BullMQ
- **Authentication**: JWT (access + refresh tokens)
- **Authorization**: CASL (RBAC)
- **Validation**: class-validator + class-transformer
- **API Documentation**: Swagger/OpenAPI
- **Password Hashing**: argon2

## 📝 Development Notes

- The backend uses PostgreSQL for production-grade data integrity
- Redis is required for BullMQ job queues (payroll computation, PDF generation, email)
- File storage and email services are mocked for local development
- Sentry integration is available but requires configuration
- The system is designed to be modular and can be split into microservices if needed

## 📄 License

UNLICENSED

## 🤝 Support

For detailed architecture and implementation guidance, refer to the documentation in the `specs/` folder.
