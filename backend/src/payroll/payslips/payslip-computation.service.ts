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
  severity: 'blocking' | 'info';
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
   * Worked days = distinct days with an attendance record, plus approved leave
   * on a type that does not reduce pay (paid leave still earns salary).
   */
  private async resolveWorkedDays(employeeId: string, periodStart: Date, periodEnd: Date) {
    const totalDays = Math.max(
      1,
      Math.round((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY) + 1,
    );

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
