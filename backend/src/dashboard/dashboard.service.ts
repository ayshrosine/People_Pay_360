import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DashboardFilters {
  period?: string;
  departmentId?: string;
  employeeType?: string;
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getKPIs(filters: DashboardFilters) {
    const { period, departmentId, employeeType } = filters;

    // Build date range from period
    const dateRange = this.parsePeriod(period);

    // Get total net salary paid
    const totalNetSalaryPaid = await this.prisma.payslip.aggregate({
      where: {
        status: 'PAID',
        payrun: {
          periodStart: dateRange.start ? { gte: dateRange.start } : undefined,
          periodEnd: dateRange.end ? { lte: dateRange.end } : undefined,
        },
        employee: {
          ...(departmentId ? { departmentId } : {}),
          ...(employeeType ? { employeeType } : {}),
        },
      },
      _sum: {
        netAmount: true,
      },
    });

    // Get payslips generated
    const payslipsGenerated = await this.prisma.payslip.count({
      where: {
        payrun: {
          periodStart: dateRange.start ? { gte: dateRange.start } : undefined,
          periodEnd: dateRange.end ? { lte: dateRange.end } : undefined,
        },
        employee: {
          ...(departmentId ? { departmentId } : {}),
          ...(employeeType ? { employeeType } : {}),
        },
      },
    });

    // Get average salary
    const avgSalaryResult = await this.prisma.payslip.aggregate({
      where: {
        status: 'PAID',
        payrun: {
          periodStart: dateRange.start ? { gte: dateRange.start } : undefined,
          periodEnd: dateRange.end ? { lte: dateRange.end } : undefined,
        },
        employee: {
          ...(departmentId ? { departmentId } : {}),
          ...(employeeType ? { employeeType } : {}),
        },
      },
      _avg: {
        netAmount: true,
      },
    });

    // Get approved time off days
    const approvedTimeOffDays = await this.prisma.timeOffRequest.aggregate({
      where: {
        status: 'APPROVED',
        startDate: dateRange.start ? { gte: dateRange.start } : undefined,
        endDate: dateRange.end ? { lte: dateRange.end } : undefined,
        ...(departmentId && { employee: { departmentId } }),
        ...(employeeType && { employee: { employeeType } }),
      },
      _sum: {
        duration: true,
      },
    });

    // Calculate attendance health percentage
    const totalAttendance = await this.prisma.attendance.count({
      where: {
        ...(dateRange.start && { checkIn: { gte: dateRange.start } }),
        ...(dateRange.end && { checkIn: { lte: dateRange.end } }),
        ...(departmentId && { employee: { departmentId } }),
        ...(employeeType && { employee: { employeeType } }),
      },
    });

    const presentAttendance = await this.prisma.attendance.count({
      where: {
        status: 'PRESENT',
        ...(dateRange.start && { checkIn: { gte: dateRange.start } }),
        ...(dateRange.end && { checkIn: { lte: dateRange.end } }),
        ...(departmentId && { employee: { departmentId } }),
        ...(employeeType && { employee: { employeeType } }),
      },
    });

    const attendanceHealthPct = totalAttendance > 0 
      ? (presentAttendance / totalAttendance) * 100 
      : 0;

    return {
      totalNetSalaryPaid: Number(totalNetSalaryPaid._sum.netAmount || 0),
      payslipsGenerated,
      avgSalary: Number(avgSalaryResult._avg.netAmount || 0),
      approvedTimeOffDays: Number(approvedTimeOffDays._sum.duration || 0),
      attendanceHealthPct: Math.round(attendanceHealthPct * 100) / 100,
    };
  }

  async getSalaryCostByDepartment(filters: DashboardFilters) {
    const { period, departmentId } = filters;
    const dateRange = this.parsePeriod(period);

    const salaryCosts = await this.prisma.payslip.groupBy({
      by: ['employeeId'],
      where: {
        status: 'PAID',
        payrun: {
          periodStart: dateRange.start ? { gte: dateRange.start } : undefined,
          periodEnd: dateRange.end ? { lte: dateRange.end } : undefined,
        },
      },
      _sum: {
        netAmount: true,
      },
    });

    // Get department information for each employee
    const employeeIds = salaryCosts.map(s => s.employeeId);
    const employees = await this.prisma.employee.findMany({
      where: {
        id: { in: employeeIds },
        departmentId: departmentId || undefined,
      },
      include: {
        department: true,
      },
    });

    // Group by department
    const departmentCosts = employees.reduce((acc, emp) => {
      const payslipSum = salaryCosts.find(s => s.employeeId === emp.id);
      if (!payslipSum || !payslipSum._sum) return acc;
      const deptName = emp.department?.name || 'Unassigned';
      
      if (!acc[deptName]) {
        acc[deptName] = 0;
      }
      
      acc[deptName] += Number(payslipSum?._sum.netAmount || 0);
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(departmentCosts).map(([department, totalCost]) => ({
      department,
      totalCost,
    }));
  }

  async getMonthlyNetSalaryTrend(filters: DashboardFilters) {
    const { period, departmentId } = filters;
    const dateRange = this.parsePeriod(period);

    const monthlyTrends = await this.prisma.payrun.findMany({
      where: {
        periodStart: dateRange.start ? { gte: dateRange.start } : undefined,
        periodEnd: dateRange.end ? { lte: dateRange.end } : undefined,
      },
      include: {
        payslips: {
          where: {
            status: 'PAID',
            employee: departmentId ? { departmentId } : undefined,
          },
        },
      },
      orderBy: {
        periodStart: 'asc',
      },
    });

    return monthlyTrends.map(payrun => ({
      month: payrun.periodStart.toISOString().slice(0, 7), // YYYY-MM
      netTotal: payrun.payslips.reduce((sum, payslip) => sum + Number(payslip.netAmount), 0),
    }));
  }

  async getPayslipStatusBreakdown(filters: DashboardFilters) {
    const { period, departmentId } = filters;
    const dateRange = this.parsePeriod(period);

    const statusBreakdown = await this.prisma.payslip.groupBy({
      by: ['status'],
      where: {
        payrun: {
          periodStart: dateRange.start ? { gte: dateRange.start } : undefined,
          periodEnd: dateRange.end ? { lte: dateRange.end } : undefined,
        },
        employee: departmentId ? { departmentId } : undefined,
      },
      _count: {
        status: true,
      },
    });

    return statusBreakdown.map(({ status, _count }) => ({
      status,
      count: _count.status,
    }));
  }

  async getAlerts() {
    // Get payslips with errors
    const errorPayslips = await this.prisma.payslip.findMany({
      where: {
        status: 'ERROR',
      },
      include: {
        employee: true,
        payrun: true,
      },
      take: 10,
    });

    // Get employees without bank details
    const employeesWithoutBank = await this.prisma.employee.findMany({
      where: {
        bankAccount: null,
        status: 'ACTIVE',
      },
      take: 10,
    });

    // Get contracts ending soon (within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const contractsEndingSoon = await this.prisma.contract.findMany({
      where: {
        status: 'RUNNING',
        endDate: {
          lte: thirtyDaysFromNow,
        },
      },
      include: {
        employee: true,
      },
      take: 10,
    });

    return {
      errorPayslips: errorPayslips.map(p => ({
        code: 'PAYSLIP_ERROR',
        message: `Payslip error for ${p.employee.name}`,
        payslipId: p.id,
        employeeId: p.employeeId,
        payrunId: p.payrunId,
      })),
      employeesWithoutBank: employeesWithoutBank.map(e => ({
        code: 'MISSING_BANK_DETAILS',
        message: `Employee ${e.name} has no bank account on file`,
        employeeId: e.id,
      })),
      contractsEndingSoon: contractsEndingSoon.map(c => ({
        code: 'CONTRACT_ENDING_SOON',
        message: `Contract for ${c.employee.name} ends on ${c.endDate?.toISOString().slice(0, 10)}`,
        contractId: c.id,
        employeeId: c.employeeId,
        endDate: c.endDate,
      })),
    };
  }

  async getAttendanceOverview(filters: DashboardFilters) {
    const { period, departmentId } = filters;
    const dateRange = this.parsePeriod(period);

    const attendanceRecords = await this.prisma.attendance.findMany({
      where: {
        ...(dateRange.start && { checkIn: { gte: dateRange.start } }),
        ...(dateRange.end && { checkIn: { lte: dateRange.end } }),
        ...(departmentId && { employee: { departmentId } }),
      },
    });

    const present = attendanceRecords.filter(a => a.status === 'PRESENT').length;
    const late = attendanceRecords.filter(a => a.status === 'LATE').length;
    const absent = attendanceRecords.filter(a => a.status === 'ABSENT').length;
    const overtime = attendanceRecords.filter(a => a.status === 'OVERTIME').length;
    const missingCheckouts = attendanceRecords.filter(a => a.status === 'MISSING_CHECKOUT').length;
    const manualEdits = attendanceRecords.filter(a => a.isManualEdit).length;

    const total = attendanceRecords.length;
    const coveragePct = total > 0 ? ((present + late + overtime) / total) * 100 : 0;

    return {
      present,
      late,
      absent,
      overtime,
      missingCheckouts,
      manualEdits,
      coveragePct: Math.round(coveragePct * 100) / 100,
    };
  }

  async getTimeOffOverview(filters: DashboardFilters) {
    const { period, departmentId } = filters;
    const dateRange = this.parsePeriod(period);

    const timeOffRequests = await this.prisma.timeOffRequest.findMany({
      where: {
        startDate: dateRange.start ? { gte: dateRange.start } : undefined,
        endDate: dateRange.end ? { lte: dateRange.end } : undefined,
        employee: departmentId ? { departmentId } : undefined,
      },
      include: {
        timeOffType: true,
      },
    });

    const approvedDays = timeOffRequests
      .filter(r => r.status === 'APPROVED')
      .reduce((sum, r) => sum + r.duration, 0);

    const pendingRequests = timeOffRequests.filter(r => r.status === 'TO_APPROVE').length;

    const byType = timeOffRequests.reduce((acc, request) => {
      const typeName = request.timeOffType.name;
      if (!acc[typeName]) {
        acc[typeName] = 0;
      }
      acc[typeName] += request.duration;
      return acc;
    }, {} as Record<string, number>);

    return {
      approvedDays,
      pendingRequests,
      byType: Object.entries(byType).map(([type, days]) => ({ type, days })),
    };
  }

  async getDepartmentOverview() {
    const departments = await this.prisma.department.findMany({
      include: {
        _count: {
          select: { employees: true },
        },
      },
    });

    const departmentOverviews = await Promise.all(
      departments.map(async (dept) => {
        const employees = await this.prisma.employee.findMany({
          where: { departmentId: dept.id },
          include: {
            contracts: {
              where: { status: 'RUNNING' },
            },
          },
        });

        const totalSalary = employees.reduce((sum, emp) => {
          const activeContract = emp.contracts[0];
          return sum + (activeContract ? Number(activeContract.wage) : 0);
        }, 0);

        return {
          department: dept.name,
          headcount: dept._count.employees,
          totalSalary,
        };
      }),
    );

    return departmentOverviews;
  }

  private parsePeriod(period?: string): { start?: Date; end?: Date } {
    if (!period) {
      return {};
    }

    const now = new Date();
    const start = new Date();
    const end = new Date();

    switch (period) {
      case 'this_month':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'last_month':
        start.setMonth(start.getMonth() - 1);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'this_year':
        start.setMonth(0);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(11);
        end.setDate(31);
        end.setHours(23, 59, 59, 999);
        break;
      case 'last_30_days':
        start.setDate(now.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'last_90_days':
        start.setDate(now.getDate() - 90);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      default:
        // Try to parse as YYYY-MM
        const match = period.match(/^(\d{4})-(\d{2})$/);
        if (match) {
          const year = parseInt(match[1]);
          const month = parseInt(match[2]) - 1; // 0-indexed
          start.setFullYear(year, month, 1);
          start.setHours(0, 0, 0, 0);
          end.setFullYear(year, month + 1, 0);
          end.setHours(23, 59, 59, 999);
        } else {
          return {};
        }
    }

    return { start, end };
  }
}
