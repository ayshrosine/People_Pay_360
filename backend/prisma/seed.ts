import { PrismaClient, RoleName, EmployeeStatus, ContractStatus, AttendanceStatus, TimeOffRequestStatus, TimeOffUnit, PayrunStatus, PayslipStatus, SalaryCategory, ComputationType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Hash password for all users
  const hashedPassword = await argon2.hash('password123');

  // Create Users with all roles
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@odoopnx.com' },
    update: {},
    create: {
      email: 'admin@odoopnx.com',
      passwordHash: hashedPassword,
      role: RoleName.ADMIN,
      isActive: true,
    },
  });

  const hrManagerUser = await prisma.user.upsert({
    where: { email: 'hr.manager@odoopnx.com' },
    update: {},
    create: {
      email: 'hr.manager@odoopnx.com',
      passwordHash: await argon2.hash('ChangeMe123!'),
      role: RoleName.HR_MANAGER,
      isActive: true,
    },
  });

  const hrPayrollUser = await prisma.user.upsert({
    where: { email: 'hrpayroll@odoopnx.com' },
    update: {},
    create: {
      email: 'hrpayroll@odoopnx.com',
      passwordHash: hashedPassword,
      role: RoleName.HR_PAYROLL_USER,
      isActive: true,
    },
  });

  const hrPayrollManagerUser = await prisma.user.upsert({
    where: { email: 'hrpayrollmanager@odoopnx.com' },
    update: {},
    create: {
      email: 'hrpayrollmanager@odoopnx.com',
      passwordHash: hashedPassword,
      role: RoleName.HR_PAYROLL_MANAGER,
      isActive: true,
    },
  });

  // Create Departments
  const engineeringDept = await prisma.department.upsert({
    where: { id: 'engineering-dept' },
    update: {},
    create: {
      id: 'engineering-dept',
      name: 'Engineering',
    },
  });

  const salesDept = await prisma.department.upsert({
    where: { id: 'sales-dept' },
    update: {},
    create: {
      id: 'sales-dept',
      name: 'Sales',
    },
  });

  const hrDept = await prisma.department.upsert({
    where: { id: 'hr-dept' },
    update: {},
    create: {
      id: 'hr-dept',
      name: 'Human Resources',
    },
  });

  // Create Working Schedule
  const standardSchedule = await prisma.workingSchedule.upsert({
    where: { id: 'standard-schedule' },
    update: {},
    create: {
      id: 'standard-schedule',
      name: 'Standard 40-hour Week',
      company: 'Odoo PNX',
      timezone: 'Asia/Kolkata',
      scheduleType: 'Fixed',
      totalWeeklyHours: 40,
      status: 'Active',
      lines: {
        create: [
          { dayOfWeek: 0, startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
          { dayOfWeek: 1, startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
          { dayOfWeek: 2, startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
          { dayOfWeek: 3, startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
          { dayOfWeek: 4, startTime: '09:00', endTime: '18:00', breakMinutes: 60 },
        ],
      },
    },
  });

  // Create Employees
  const employee1 = await prisma.employee.upsert({
    where: { workEmail: 'john.doe@odoopnx.com' },
    update: {},
    create: {
      id: 'employee-1',
      name: 'John Doe',
      workEmail: 'john.doe@odoopnx.com',
      jobPosition: 'Senior Software Engineer',
      departmentId: engineeringDept.id,
      status: EmployeeStatus.ACTIVE,
      phone: '+91-9876543210',
      employeeType: 'Full-time',
      bankAccount: '1234567890',
      bankIfsc: 'HDFC0001234',
      user: {
        create: {
          email: 'john.doe@odoopnx.com',
          passwordHash: hashedPassword,
          role: RoleName.EMPLOYEE,
          isActive: true,
        },
      },
    },
  });

  const employee2 = await prisma.employee.upsert({
    where: { workEmail: 'jane.smith@odoopnx.com' },
    update: {},
    create: {
      id: 'employee-2',
      name: 'Jane Smith',
      workEmail: 'jane.smith@odoopnx.com',
      jobPosition: 'Sales Manager',
      departmentId: salesDept.id,
      managerId: employee1.id,
      status: EmployeeStatus.ACTIVE,
      phone: '+91-9876543211',
      employeeType: 'Full-time',
      bankAccount: '1234567891',
      bankIfsc: 'HDFC0001235',
      user: {
        create: {
          email: 'jane.smith@odoopnx.com',
          passwordHash: hashedPassword,
          role: RoleName.EMPLOYEE,
          isActive: true,
        },
      },
    },
  });

  const employee3 = await prisma.employee.upsert({
    where: { workEmail: 'bob.wilson@odoopnx.com' },
    update: {},
    create: {
      id: 'employee-3',
      name: 'Bob Wilson',
      workEmail: 'bob.wilson@odoopnx.com',
      jobPosition: 'HR Specialist',
      departmentId: hrDept.id,
      status: EmployeeStatus.ACTIVE,
      phone: '+91-9876543212',
      employeeType: 'Full-time',
      bankAccount: '1234567892',
      bankIfsc: 'HDFC0001236',
      user: {
        create: {
          email: 'bob.wilson@odoopnx.com',
          passwordHash: hashedPassword,
          role: RoleName.EMPLOYEE,
          isActive: true,
        },
      },
    },
  });

  // Create Contracts
  const contract1 = await prisma.contract.upsert({
    where: { id: 'contract-1' },
    update: {},
    create: {
      id: 'contract-1',
      employeeId: employee1.id,
      department: engineeringDept.name,
      jobPosition: 'Senior Software Engineer',
      startDate: new Date('2024-01-01'),
      wage: 100000,
      wageType: 'Monthly',
      status: ContractStatus.RUNNING,
      workingScheduleId: standardSchedule.id,
    },
  });

  const contract2 = await prisma.contract.upsert({
    where: { id: 'contract-2' },
    update: {},
    create: {
      id: 'contract-2',
      employeeId: employee2.id,
      department: salesDept.name,
      jobPosition: 'Sales Manager',
      startDate: new Date('2024-02-01'),
      wage: 80000,
      wageType: 'Monthly',
      status: ContractStatus.RUNNING,
      workingScheduleId: standardSchedule.id,
    },
  });

  // Create Time Off Types
  const annualLeave = await prisma.timeOffType.upsert({
    where: { id: 'annual-leave' },
    update: {},
    create: {
      id: 'annual-leave',
      name: 'Annual Leave',
      unit: TimeOffUnit.DAYS,
      requiresAllocation: true,
      requiresApproval: true,
      affectsPayroll: true,
      colorHex: '#6366F1',
    },
  });

  const sickLeave = await prisma.timeOffType.upsert({
    where: { id: 'sick-leave' },
    update: {},
    create: {
      id: 'sick-leave',
      name: 'Sick Leave',
      unit: TimeOffUnit.DAYS,
      requiresAllocation: true,
      requiresApproval: true,
      affectsPayroll: true,
      colorHex: '#EF4444',
    },
  });

  // Create Time Off Allocations
  await prisma.timeOffAllocation.upsert({
    where: { id: 'allocation-1' },
    update: {},
    create: {
      id: 'allocation-1',
      employeeId: employee1.id,
      timeOffTypeId: annualLeave.id,
      allocated: 20,
      taken: 0,
      remaining: 20,
      validFrom: new Date('2024-01-01'),
      validTo: new Date('2024-12-31'),
      status: 'Approved',
    },
  });

  await prisma.timeOffAllocation.upsert({
    where: { id: 'allocation-2' },
    update: {},
    create: {
      id: 'allocation-2',
      employeeId: employee2.id,
      timeOffTypeId: annualLeave.id,
      allocated: 20,
      taken: 0,
      remaining: 20,
      validFrom: new Date('2024-01-01'),
      validTo: new Date('2024-12-31'),
      status: 'Approved',
    },
  });

  // Create Salary Structure
  const standardStructure = await prisma.salaryStructure.upsert({
    where: { id: 'standard-structure' },
    update: {},
    create: {
      id: 'standard-structure',
      name: 'Standard Salary Structure',
      description: 'Standard salary structure for full-time employees',
      isActive: true,
      rules: {
        create: [
          {
            name: 'Basic Salary',
            code: 'BASIC',
            category: SalaryCategory.BASIC,
            sequence: 1,
            // Derived from the employee's contract wage, pro-rated by the days
            // actually worked in the period. A fixed amount here would pay every
            // employee the same regardless of their contract, which is wrong.
            computationType: ComputationType.FORMULA,
            formula: 'basicWage * (workedDays / totalDays)',
            active: true,
          },
          {
            name: 'House Rent Allowance',
            code: 'HRA',
            category: SalaryCategory.ALLOWANCE,
            sequence: 2,
            computationType: ComputationType.PERCENTAGE,
            percentageOf: 'BASIC',
            percentageValue: 40,
            active: true,
          },
          {
            name: 'Provident Fund',
            code: 'PF',
            category: SalaryCategory.DEDUCTION,
            sequence: 3,
            computationType: ComputationType.PERCENTAGE,
            percentageOf: 'BASIC',
            percentageValue: 12,
            active: true,
          },
          {
            name: 'Gross Salary',
            code: 'GROSS',
            category: SalaryCategory.GROSS,
            sequence: 4,
            computationType: ComputationType.FORMULA,
            formula: 'BASIC + HRA',
            active: true,
          },
          {
            name: 'Net Salary',
            code: 'NET',
            category: SalaryCategory.NET,
            sequence: 5,
            computationType: ComputationType.FORMULA,
            formula: 'GROSS - PF',
            active: true,
          },
        ],
      },
    },
  });

  // Update contracts to use salary structure
  await prisma.contract.update({
    where: { id: contract1.id },
    data: { salaryStructureId: standardStructure.id },
  });

  await prisma.contract.update({
    where: { id: contract2.id },
    data: { salaryStructureId: standardStructure.id },
  });

  // Create Attendance records
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  await prisma.attendance.create({
    data: {
      employeeId: employee1.id,
      checkIn: new Date(yesterday.setHours(9, 0, 0, 0)),
      checkOut: new Date(yesterday.setHours(18, 0, 0, 0)),
      workedHours: 8,
      status: AttendanceStatus.PRESENT,
    },
  });

  await prisma.attendance.create({
    data: {
      employeeId: employee2.id,
      checkIn: new Date(yesterday.setHours(9, 15, 0, 0)),
      checkOut: new Date(yesterday.setHours(18, 30, 0, 0)),
      workedHours: 8.25,
      status: AttendanceStatus.LATE,
    },
  });

  console.log('Database seed completed successfully!');
  console.log('Test users created:');
  console.log('  - admin@odoopnx.com (Admin)');
  console.log('  - hrmanager@odoopnx.com (HR Manager)');
  console.log('  - hrpayroll@odoopnx.com (HR Payroll User)');
  console.log('  - hrpayrollmanager@odoopnx.com (HR Payroll Manager)');
  console.log('  - john.doe@odoopnx.com (Employee)');
  console.log('  - jane.smith@odoopnx.com (Employee)');
  console.log('  - bob.wilson@odoopnx.com (Employee)');
  console.log('Password for all users: password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
