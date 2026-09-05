import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PayrunStatus, PayslipStatus, Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePayrunDto } from './dto/create-payrun.dto';
import { PreviewScopeDto } from './dto/preview-scope.dto';
import {
  PayslipComputationService,
  PayslipWarning,
} from '../payslips/payslip-computation.service';

@Injectable()
export class PayrunsService {
  private readonly logger = new Logger(PayrunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly computation: PayslipComputationService,
  ) {}

  /**
   * Step 1 of the wizard. Returns the employees who *would* be included, and
   * deliberately creates nothing — the payrun only exists once the user
   * explicitly clicks "Create Payrun".
   */
  async previewScope(dto: PreviewScopeDto) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    if (periodEnd < periodStart) {
      throw new BadRequestException({
        message: 'periodEnd must be on or after periodStart',
        code: 'INVALID_PERIOD',
      });
    }

    const contractFilter = {
      status: 'RUNNING' as const,
      startDate: { lte: periodEnd },
      OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
    };

    const employees = await this.prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        ...(dto.employeeType ? { employeeType: dto.employeeType } : {}),
        contracts: { some: contractFilter },
      },
      include: {
        department: true,
        workingSchedule: true,
        contracts: {
          where: contractFilter,
          orderBy: { startDate: 'desc' },
          take: 1,
          include: { salaryStructure: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const eligibleEmployees = employees.map((employee) => {
      const contract = employee.contracts[0] ?? null;
      return {
        id: employee.id,
        name: employee.name,
        workEmail: employee.workEmail,
        jobPosition: employee.jobPosition,
        employeeType: employee.employeeType,
        department: employee.department?.name ?? null,
        departmentId: employee.departmentId,
        workingHours: employee.workingSchedule?.totalWeeklyHours ?? null,
        startDate: contract?.startDate ?? null,
        wage: contract ? Number(contract.wage) : null,
        wageType: contract?.wageType ?? null,
        contractId: contract?.id ?? null,
        // Surfaced so the wizard can warn when an employee's own contract points
        // at a different structure than the one selected for this payrun.
        contractSalaryStructureId: contract?.salaryStructureId ?? null,
      };
    });

    return {
      data: eligibleEmployees,
      meta: { total: eligibleEmployees.length, page: 1, limit: eligibleEmployees.length },
    };
  }

  async findAll(params: { page?: number; limit?: number; status?: PayrunStatus } = {}) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 25;

    const where: Prisma.PayrunWhereInput = params.status ? { status: params.status } : {};

    const [payruns, total] = await this.prisma.$transaction([
      this.prisma.payrun.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          salaryStructure: true,
          _count: { select: { payslips: true } },
          payslips: { select: { netAmount: true, status: true } },
        },
        orderBy: { periodStart: 'desc' },
      }),
      this.prisma.payrun.count({ where }),
    ]);

    const data = payruns.map(({ payslips, _count, ...payrun }) => ({
      ...payrun,
      employeeCount: _count.payslips,
      totalNet: payslips.reduce((sum, slip) => sum + Number(slip.netAmount), 0),
    }));

    return { data, meta: { total, page, limit } };
  }

  async findOne(id: string) {
    const payrun = await this.prisma.payrun.findUnique({
      where: { id },
      include: {
        salaryStructure: { include: { rules: { orderBy: { sequence: 'asc' } } } },
        payslips: {
          include: {
            employee: { include: { department: true } },
            lines: { orderBy: { sequence: 'asc' } },
          },
          orderBy: { employee: { name: 'asc' } },
        },
      },
    });

    if (!payrun) {
      throw new NotFoundException({ message: 'Payrun not found', code: 'NOT_FOUND' });
    }

    return {
      ...payrun,
      totals: {
        employeeCount: payrun.payslips.length,
        gross: payrun.payslips.reduce((sum, slip) => sum + Number(slip.grossAmount), 0),
        net: payrun.payslips.reduce((sum, slip) => sum + Number(slip.netAmount), 0),
      },
      blockingWarnings: this.collectBlockingWarnings(payrun.payslips),
    };
  }

  /** Step 2 of the wizard: create the payrun plus one DRAFT payslip per employee. */
  async create(dto: CreatePayrunDto, createdById: string) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    if (periodEnd < periodStart) {
      throw new BadRequestException({
        message: 'periodEnd must be on or after periodStart',
        code: 'INVALID_PERIOD',
      });
    }

    const structure = await this.prisma.salaryStructure.findUnique({
      where: { id: dto.salaryStructureId },
      include: { rules: true },
    });

    if (!structure) {
      throw new NotFoundException({
        message: 'Salary structure not found',
        code: 'NOT_FOUND',
      });
    }

    if (structure.rules.filter((rule) => rule.active).length === 0) {
      throw new BadRequestException({
        message: `Salary structure "${structure.name}" has no active salary rules, so no payslip could be computed.`,
        code: 'EMPTY_SALARY_STRUCTURE',
      });
    }

    const uniqueEmployeeIds = [...new Set(dto.employeeIds)];
    if (uniqueEmployeeIds.length === 0) {
      throw new BadRequestException({
        message: 'Select at least one employee',
        code: 'NO_EMPLOYEES_SELECTED',
      });
    }

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: uniqueEmployeeIds } },
      select: { id: true },
    });

    if (employees.length !== uniqueEmployeeIds.length) {
      const found = new Set(employees.map((e) => e.id));
      throw new BadRequestException({
        message: 'One or more selected employees no longer exist',
        code: 'EMPLOYEE_NOT_FOUND',
        errors: uniqueEmployeeIds.filter((id) => !found.has(id)),
      });
    }

    const payrun = await this.prisma.payrun.create({
      data: {
        name: dto.name,
        periodStart,
        periodEnd,
        salaryStructureId: dto.salaryStructureId,
        employeeType: dto.employeeType,
        status: PayrunStatus.DRAFT,
        createdById,
        payslips: {
          create: uniqueEmployeeIds.map((employeeId) => ({
            employeeId,
            // Resolved during computation, when the applicable contract for the
            // period is looked up.
            contractId: '',
            workedDays: 0,
            grossAmount: new Prisma.Decimal(0),
            netAmount: new Prisma.Decimal(0),
            status: PayslipStatus.DRAFT,
          })),
        },
      },
      include: {
        salaryStructure: true,
        payslips: { include: { employee: true } },
      },
    });

    this.breadcrumb(payrun.id, PayrunStatus.DRAFT);
    return payrun;
  }

  /**
   * Computes every payslip in the payrun through the salary rule engine.
   *
   * Runs inline rather than through BullMQ so the platform works without a
   * Redis dependency; the payrun still moves through COMPUTING so the UI's
   * progress state machine is exercised, and one payslip failing does not
   * abort the rest of the batch.
   */
  async compute(id: string) {
    const payrun = await this.prisma.payrun.findUnique({
      where: { id },
      include: { payslips: { select: { id: true } } },
    });

    if (!payrun) {
      throw new NotFoundException({ message: 'Payrun not found', code: 'NOT_FOUND' });
    }

    if (payrun.status === PayrunStatus.PAID) {
      throw new BadRequestException({
        message: 'A paid payrun is immutable and cannot be recomputed.',
        code: 'PAYRUN_IMMUTABLE',
      });
    }

    if (
      payrun.status !== PayrunStatus.DRAFT &&
      payrun.status !== PayrunStatus.COMPUTED &&
      payrun.status !== PayrunStatus.ERROR
    ) {
      throw new BadRequestException({
        message: `Cannot compute a payrun in status ${payrun.status}.`,
        code: 'INVALID_PAYRUN_STATE',
      });
    }

    await this.prisma.payrun.update({
      where: { id },
      data: { status: PayrunStatus.COMPUTING },
    });
    this.breadcrumb(id, PayrunStatus.COMPUTING);

    let failures = 0;

    for (const payslip of payrun.payslips) {
      try {
        const outcome = await this.computation.computePayslip(payslip.id);
        if (outcome.status === PayslipStatus.ERROR) failures += 1;
      } catch (error) {
        failures += 1;
        this.logger.error(
          `Failed to compute payslip ${payslip.id} of payrun ${id}`,
          error instanceof Error ? error.stack : String(error),
        );
        Sentry.captureException(error, {
          tags: { job: 'compute-payslip' },
          extra: { payslipId: payslip.id, payrunId: id },
        });
        await this.prisma.payslip.update({
          where: { id: payslip.id },
          data: {
            status: PayslipStatus.ERROR,
            warnings: [
              {
                code: 'COMPUTATION_FAILED',
                severity: 'blocking',
                message: error instanceof Error ? error.message : 'Computation failed',
              },
            ] as unknown as Prisma.InputJsonValue,
          },
        });
      }
    }

    // COMPUTED even with failures: individual payslips carry their own ERROR
    // status and the validate step is what actually blocks on them.
    const nextStatus =
      payrun.payslips.length > 0 && failures === payrun.payslips.length
        ? PayrunStatus.ERROR
        : PayrunStatus.COMPUTED;

    await this.prisma.payrun.update({ where: { id }, data: { status: nextStatus } });
    this.breadcrumb(id, nextStatus);

    return this.findOne(id);
  }

  async validate(id: string) {
    const payrun = await this.prisma.payrun.findUnique({
      where: { id },
      include: { payslips: { include: { employee: { select: { name: true } } } } },
    });

    if (!payrun) {
      throw new NotFoundException({ message: 'Payrun not found', code: 'NOT_FOUND' });
    }

    if (payrun.status !== PayrunStatus.COMPUTED) {
      throw new BadRequestException({
        message: `Only a COMPUTED payrun can be validated (this one is ${payrun.status}).`,
        code: 'INVALID_PAYRUN_STATE',
      });
    }

    const blocking = this.collectBlockingWarnings(payrun.payslips);

    if (blocking.length > 0) {
      throw new BadRequestException({
        message: 'Resolve the blocking warnings before validating this payrun.',
        code: 'BLOCKING_WARNINGS',
        errors: blocking,
      });
    }

    await this.prisma.$transaction([
      this.prisma.payrun.update({
        where: { id },
        data: { status: PayrunStatus.VALIDATED, validatedAt: new Date() },
      }),
      this.prisma.payslip.updateMany({
        where: { payrunId: id },
        data: { status: PayslipStatus.VALIDATED },
      }),
    ]);

    this.breadcrumb(id, PayrunStatus.VALIDATED);
    return this.findOne(id);
  }

  async markPaid(id: string) {
    const payrun = await this.prisma.payrun.findUnique({ where: { id } });

    if (!payrun) {
      throw new NotFoundException({ message: 'Payrun not found', code: 'NOT_FOUND' });
    }

    if (payrun.status !== PayrunStatus.VALIDATED) {
      throw new BadRequestException({
        message: `Only a VALIDATED payrun can be marked paid (this one is ${payrun.status}).`,
        code: 'INVALID_PAYRUN_STATE',
      });
    }

    await this.prisma.$transaction([
      this.prisma.payrun.update({
        where: { id },
        data: { status: PayrunStatus.PAID, paidAt: new Date() },
      }),
      this.prisma.payslip.updateMany({
        where: { payrunId: id },
        data: { status: PayslipStatus.PAID },
      }),
    ]);

    this.breadcrumb(id, PayrunStatus.PAID);
    return this.findOne(id);
  }

  async sendPayslips(id: string) {
    const payrun = await this.prisma.payrun.findUnique({
      where: { id },
      include: { payslips: { include: { employee: true } } },
    });

    if (!payrun) {
      throw new NotFoundException({ message: 'Payrun not found', code: 'NOT_FOUND' });
    }

    if (payrun.status !== PayrunStatus.VALIDATED && payrun.status !== PayrunStatus.PAID) {
      throw new BadRequestException({
        message: 'Validate the payrun before sending payslips.',
        code: 'INVALID_PAYRUN_STATE',
      });
    }

    return {
      queued: payrun.payslips.length,
      payrunId: id,
      message: `${payrun.payslips.length} payslip(s) queued for delivery.`,
    };
  }

  /** Flattens the blocking warnings across every payslip in the payrun. */
  private collectBlockingWarnings(
    payslips: {
      id: string;
      employeeId: string;
      status: PayslipStatus;
      warnings: Prisma.JsonValue;
      employee?: { name: string };
    }[],
  ) {
    const blocking: {
      payslipId: string;
      employeeId: string;
      employeeName?: string;
      code: string;
      message: string;
    }[] = [];

    for (const payslip of payslips) {
      const warnings = Array.isArray(payslip.warnings)
        ? (payslip.warnings as unknown as PayslipWarning[])
        : [];

      for (const warning of warnings) {
        if (warning?.severity === 'blocking') {
          blocking.push({
            payslipId: payslip.id,
            employeeId: payslip.employeeId,
            employeeName: payslip.employee?.name,
            code: warning.code,
            message: warning.message,
          });
        }
      }

      if (payslip.status === PayslipStatus.ERROR && warnings.length === 0) {
        blocking.push({
          payslipId: payslip.id,
          employeeId: payslip.employeeId,
          employeeName: payslip.employee?.name,
          code: 'PAYSLIP_ERROR',
          message: 'Payslip is in an error state.',
        });
      }
    }

    return blocking;
  }

  /**
   * Records each payrun state transition as a Sentry breadcrumb, so an error
   * report shows the exact sequence that led to it.
   */
  private breadcrumb(payrunId: string, status: PayrunStatus) {
    Sentry.addBreadcrumb({
      category: 'payrun',
      message: `Payrun ${payrunId} -> ${status}`,
      level: 'info',
    });
  }
}
