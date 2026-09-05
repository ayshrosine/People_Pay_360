import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../common/decorators/check-ability.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  @CheckAbility({ action: 'read', subject: 'Dashboard' })
  async getKPIs(
    @Query('period') period?: string,
    @Query('departmentId') departmentId?: string,
    @Query('employeeType') employeeType?: string,
  ) {
    return this.dashboardService.getKPIs({ period, departmentId, employeeType });
  }

  @Get('salary-cost-by-department')
  @CheckAbility({ action: 'read', subject: 'Dashboard' })
  async getSalaryCostByDepartment(
    @Query('period') period?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.dashboardService.getSalaryCostByDepartment({ period, departmentId });
  }

  @Get('monthly-net-salary-trend')
  @CheckAbility({ action: 'read', subject: 'Dashboard' })
  async getMonthlyNetSalaryTrend(
    @Query('period') period?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.dashboardService.getMonthlyNetSalaryTrend({ period, departmentId });
  }

  @Get('payslip-status-breakdown')
  @CheckAbility({ action: 'read', subject: 'Dashboard' })
  async getPayslipStatusBreakdown(
    @Query('period') period?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.dashboardService.getPayslipStatusBreakdown({ period, departmentId });
  }

  @Get('alerts')
  @CheckAbility({ action: 'read', subject: 'Dashboard' })
  async getAlerts() {
    return this.dashboardService.getAlerts();
  }

  @Get('attendance-overview')
  @CheckAbility({ action: 'read', subject: 'Dashboard' })
  async getAttendanceOverview(
    @Query('period') period?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.dashboardService.getAttendanceOverview({ period, departmentId });
  }

  @Get('time-off-overview')
  @CheckAbility({ action: 'read', subject: 'Dashboard' })
  async getTimeOffOverview(
    @Query('period') period?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.dashboardService.getTimeOffOverview({ period, departmentId });
  }

  @Get('department-overview')
  @CheckAbility({ action: 'read', subject: 'Dashboard' })
  async getDepartmentOverview() {
    return this.dashboardService.getDepartmentOverview();
  }
}
