import { Injectable, Logger } from '@nestjs/common';
import {
  Contract,
  Payrun,
  Prisma,
  PayslipStatus,
  SalaryCategory,
  SalaryRule,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RuleEngineService } from '../rule-engine/rule-engine.service';

export interface PayslipWarning {
  code: string;
  /**
   * `blocking` stops the payrun being validated; `warning` is shown but does
   * not, for results that are unusual yet legitimate — an employee on unpaid
   * leave all month genuinely earns nothing.
   */
  severity: 'blocking' | 'warning' | 'info';
  message: string;
}

export interface ComputationOutcome {
  payslipId: string;
  status: PayslipStatus;
  warnings: PayslipWarning[];
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Turns a DRAFT payslip into a computed snapshot.
 *
 * The salary rules genuinely drive the numbers here: the rule engine runs the
 * structure's rules in sequence and every result is persisted as a
 * PayslipLine. Once a payrun is PAID those lines are never recomputed, so a
 * later edit to a SalaryRule cannot retroactively change what someone was paid.
 */
@Injectable()
export class PayslipComputationService {
  private readonly logger = new Logger(PayslipComputationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngineService,
  ) {}

  async computePayslip(payslipId: string): Promise<ComputationOutcome> {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      include: {
        employee: true,
        payrun: {
          include: {
            salaryStructure: {
              include: { rules: { orderBy: { sequence: 'asc' } } },
            },
          },
        },
      },
    });

    if (!payslip) {
      throw new Error(`Payslip ${payslipId} not found`);
    }

    const { payrun, employee } = payslip;
    const contract = await this.resolveContract(payslip.employeeId, payrun);

    if (!contract) {
      return this.failPayslip(payslip.id, [
        {
          code: 'NO_ACTIVE_CONTRACT',
          severity: 'blocking',
          message: `${employee.name} has no RUNNING contract covering this pay period.`,
        },
      ]);
    }

    const { workedDays, totalDays } = await this.resolveWorkedDays(
      payslip.employeeId,
      payrun.periodStart,
      payrun.periodEnd,
      contract.workingScheduleId,
    );

    const rules = payrun.salaryStructure.rules.filter((rule) => rule.active);

    let engineResult;
    try {
      engineResult = this.ruleEngine.run(rules, {
        basicWage: Number(contract.wage),
        workedDays,
        totalDays,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Rule engine failed for payslip ${payslip.id}: ${message}`);
      return this.failPayslip(payslip.id, [
        { code: 'RULE_EVALUATION_FAILED', severity: 'blocking', message },
      ]);
    }

    const { context, lines } = engineResult;
    const grossAmount = this.deriveGross(context, lines, rules);
    const netAmount = this.deriveNet(context, lines, rules, grossAmount);
    const warnings = this.collectWarnings(employee, contract, payrun);

    // A payslip worth nothing is the one result an operator will assume is a
    // bug, so it has to say why. It is not blocking: an employee on unpaid
    // leave for a whole month legitimately earns nothing.
    if (workedDays <= 0) {
      warnings.push({
        code: 'NO_WORKED_DAYS',
        severity: 'warning',
        message:
          `${employee.name} has no attendance or paid leave in this period, so their pay ` +
          'computes to zero. Record their attendance, or remove them from this payrun.',
      });
    } else if (netAmount <= 0) {
      warnings.push({
        code: 'ZERO_NET_PAY',
        severity: 'warning',
        message: `${employee.name}'s net pay computes to zero. Check the salary rules for this structure.`,
      });
    }

    await this.prisma.$transaction([
      // A recompute must fully replace the previous snapshot, not append to it.
      this.prisma.payslipLine.deleteMany({ where: { payslipId: payslip.id } }),
      this.prisma.payslip.update({
        where: { id: payslip.id },
        data: {
          contractId: contract.id,
          workedDays,
          grossAmount: new Prisma.Decimal(grossAmount.toFixed(2)),
          netAmount: new Prisma.Decimal(netAmount.toFixed(2)),
          status: PayslipStatus.COMPUTED,
          warnings: warnings as unknown as Prisma.InputJsonValue,
          lines: {
            create: lines.map((line) => ({
              ruleCode: line.ruleCode,
              label: line.label,
              category: line.category as SalaryCategory,
              amount: new Prisma.Decimal(line.amount.toFixed(2)),
              sequence: line.sequence,
            })),
          },
        },
      }),
    ]);

    return { payslipId: payslip.id, status: PayslipStatus.COMPUTED, warnings };
  }

  /** Resolves the one contract applicable to the payrun period. */
  private resolveContract(employeeId: string, payrun: Payrun): Promise<Contract | null> {
    return this.prisma.contract.findFirst({
      where: {
        employeeId,
        status: 'RUNNING',
        startDate: { lte: payrun.periodEnd },
        OR: [{ endDate: null }, { endDate: { gte: payrun.periodStart } }],
      },
      orderBy: { startDate: 'desc' },
    });
  }

  /**
   * Counts the days in the period that the schedule actually rosters. Schedule
   * lines store 0 = Monday .. 6 = Sunday, whereas `Date#getDay` uses
   * 0 = Sunday, hence the rotation. With no schedule attached, a standard
   * Monday-to-Friday week is the sane default.
   */
  private async countWorkingDays(
    periodStart: Date,
    periodEnd: Date,
    workingScheduleId?: string | null,
  ): Promise<number> {
    let rosteredDays = new Set([0, 1, 2, 3, 4]);

    if (workingScheduleId) {
      const lines = await this.prisma.workingScheduleLine.findMany({
        where: { scheduleId: workingScheduleId },
        select: { dayOfWeek: true },
      });
      if (lines.length > 0) {
        rosteredDays = new Set(lines.map((line) => line.dayOfWeek));
      }
    }

    let count = 0;
    const cursor = new Date(periodStart);
    while (cursor <= periodEnd) {
      if (rosteredDays.has((cursor.getDay() + 6) % 7)) count += 1;
      cursor.setDate(cursor.getDate() + 1);
    }

    // Never zero: a pro-rating formula divides by this.
    return Math.max(1, count);
  }

  /**
   * Worked days = distinct days with an attendance record, plus approved leave
   * on a type that does not reduce pay (paid leave still earns salary).
   *
   * `totalDays` is the number of *scheduled working* days in the period, not
   * calendar days. Pro-rating rules divide one by the other, and an employee
   * who never misses a shift must come out at exactly 1.0 - dividing ~22
   * attended days by ~30 calendar days would silently dock everyone a quarter
   * of their salary for working their full contracted month.
   */
  private async resolveWorkedDays(
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
    workingScheduleId?: string | null,
  ) {
    const totalDays = await this.countWorkingDays(periodStart, periodEnd, workingScheduleId);

    const [attendances, approvedLeave] = await Promise.all([
      this.prisma.attendance.findMany({
        where: {
          employeeId,
          checkIn: { gte: periodStart, lte: periodEnd },
          status: { notIn: ['ABSENT'] },
        },
        select: { checkIn: true },
      }),
      this.prisma.timeOffRequest.findMany({
        where: {
          employeeId,
          status: 'APPROVED',
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
        include: { timeOffType: true },
      }),
    ]);

    const attendedDays = new Set(
      attendances.map((a) => a.checkIn.toISOString().slice(0, 10)),
    );

    const paidLeaveDays = approvedLeave
      .filter((request) => !request.timeOffType.affectsPayroll)
      .reduce((sum, request) => sum + request.duration, 0);

    const workedDays = Math.min(totalDays, attendedDays.size + paidLeaveDays);

    return { workedDays, totalDays };
  }

  /**
   * Prefers an explicit GROSS-category rule (the structure author said what
   * gross means); otherwise sums the earnings categories.
   */
  private deriveGross(
    context: Record<string, number>,
    lines: { ruleCode: string; category: string; amount: number }[],
    rules: SalaryRule[],
  ): number {
    const grossRule = rules.find((rule) => rule.category === SalaryCategory.GROSS);
    if (grossRule && typeof context[grossRule.code] === 'number') {
      return context[grossRule.code];
    }

    return lines
      .filter(
        (line) =>
          line.category === SalaryCategory.BASIC ||
          line.category === SalaryCategory.ALLOWANCE,
      )
      .reduce((sum, line) => sum + line.amount, 0);
  }

  /** Prefers an explicit NET rule; otherwise gross minus deductions. */
  private deriveNet(
    context: Record<string, number>,
    lines: { ruleCode: string; category: string; amount: number }[],
    rules: SalaryRule[],
    grossAmount: number,
  ): number {
    const netRule = rules.find((rule) => rule.category === SalaryCategory.NET);
    if (netRule && typeof context[netRule.code] === 'number') {
      return context[netRule.code];
    }

    const deductions = lines
      .filter((line) => line.category === SalaryCategory.DEDUCTION)
      .reduce((sum, line) => sum + Math.abs(line.amount), 0);

    return grossAmount - deductions;
  }

  private collectWarnings(
    employee: { name: string; bankAccount: string | null },
    contract: Contract,
    payrun: Payrun,
  ): PayslipWarning[] {
    const warnings: PayslipWarning[] = [];

    if (!employee.bankAccount) {
      warnings.push({
        code: 'MISSING_BANK_DETAILS',
        severity: 'blocking',
        message: `${employee.name} has no bank account on file.`,
      });
    }

    if (contract.endDate) {
      const daysToEnd = Math.round(
        (contract.endDate.getTime() - payrun.periodEnd.getTime()) / MS_PER_DAY,
      );
      if (daysToEnd >= 0 && daysToEnd <= 30) {
        warnings.push({
          code: 'CONTRACT_ENDING_SOON',
          severity: 'info',
          message: `Contract ends on ${contract.endDate.toISOString().slice(0, 10)}.`,
        });
      }
    }

    return warnings;
  }

  private async failPayslip(
    payslipId: string,
    warnings: PayslipWarning[],
  ): Promise<ComputationOutcome> {
    await this.prisma.$transaction([
      this.prisma.payslipLine.deleteMany({ where: { payslipId } }),
      this.prisma.payslip.update({
        where: { id: payslipId },
        data: {
          status: PayslipStatus.ERROR,
          workedDays: 0,
          grossAmount: new Prisma.Decimal(0),
          netAmount: new Prisma.Decimal(0),
          warnings: warnings as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);

    return { payslipId, status: PayslipStatus.ERROR, warnings };
  }
}
