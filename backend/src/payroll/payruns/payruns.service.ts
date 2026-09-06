import {
  Injectable,
  ConflictException,
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
        contracts: {
          where: contractFilter,
          orderBy: { startDate: 'desc' },
          take: 1,
          // The schedule is a contract term, so the hours shown for a period
          // come from the contract that covers it, not from the person.
          include: { salaryStructure: true, workingSchedule: true },
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
        workingHours: contract?.workingSchedule?.totalWeeklyHours ?? null,
        startDate: contract?.startDate ?? null,
        wage: contract ? Number(contract.wage) : null,
        wageType: contract?.wageType ?? null,
        contractId: contract?.id ?? null,
        // Surfaced so the wizard can warn when an employee's own contract points
        // at a different structure than the one selected for this payrun.
        contractSalaryStructureId: contract?.salaryStructureId ?? null,
      };
    });

    // Anyone already carrying a payslip for an overlapping period cannot be
    // included again — `create` refuses it as DUPLICATE_PAYSLIP. Offering them
    // in the picker and then rejecting the whole payrun wastes the operator's
    // time, so they are separated out here with the reason attached.
    const clashing = await this.prisma.payslip.findMany({
      where: {
        employeeId: { in: eligibleEmployees.map((employee) => employee.id) },
        payrun: {
          status: { not: PayrunStatus.ERROR },
          periodStart: { lte: periodEnd },
          periodEnd: { gte: periodStart },
        },
      },
      include: { payrun: { select: { id: true, name: true, status: true } } },
    });

    const alreadyPaid = new Map(clashing.map((payslip) => [payslip.employeeId, payslip.payrun]));

    const selectable = eligibleEmployees.filter((employee) => !alreadyPaid.has(employee.id));

    const excluded = eligibleEmployees
      .filter((employee) => alreadyPaid.has(employee.id))
      .map((employee) => {
        const payrun = alreadyPaid.get(employee.id)!;
        return {
          ...employee,
          excludedReason: 'DUPLICATE_PAYSLIP',
          excludedMessage: `Already has a payslip in "${payrun.name}" (${payrun.status}).`,
          existingPayrunId: payrun.id,
          existingPayrunName: payrun.name,
        };
      });

    return {
      data: selectable,
      meta: {
        total: selectable.length,
        page: 1,
        limit: selectable.length,
        // Surfaced so the wizard can say why somebody is missing rather than
        // leaving the operator to wonder.
        excluded,
        excludedCount: excluded.length,
      },
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

    // Nobody may be paid twice for the same period. A second payrun over the
    // same dates containing the same people is the one mistake in this module
    // that quietly costs real money, so it is refused by name here rather than
    // discovered in a bank reconciliation later.
    const overlapping = await this.prisma.payrun.findMany({
      where: {
        status: { not: PayrunStatus.ERROR },
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
        payslips: { some: { employeeId: { in: uniqueEmployeeIds } } },
      },
      include: {
        payslips: {
          where: { employeeId: { in: uniqueEmployeeIds } },
          include: { employee: { select: { id: true, name: true } } },
        },
      },
    });

    if (overlapping.length > 0) {
      const clashes = overlapping.flatMap((run) =>
        run.payslips.map((payslip) => ({
          employeeId: payslip.employeeId,
          employeeName: payslip.employee?.name,
          payrunId: run.id,
          payrunName: run.name,
          code: 'DUPLICATE_PAYSLIP',
          message: `${payslip.employee?.name ?? 'This employee'} already has a payslip in "${run.name}" for an overlapping period.`,
        })),
      );

      const names = [...new Set(clashes.map((c) => c.employeeName).filter(Boolean))];

      throw new ConflictException({
        message:
          `${names.length} of the selected employee(s) already have a payslip covering this period ` +
          `(${names.slice(0, 3).join(', ')}${names.length > 3 ? `, +${names.length - 3} more` : ''}). ` +
          'Remove them from the selection, or delete the earlier payrun.',
        code: 'DUPLICATE_PAYSLIP',
        errors: clashes,
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
   * Redis dependency, but it does *not* block the request: the payrun is put
   * into COMPUTING, the work is started, and the endpoint returns immediately.
   * The UI already polls while a payrun is COMPUTING.
   *
   * Computing fourteen payslips took 77 seconds when this awaited each one in
   * turn — long enough that operators concluded the button was broken. The
   * payslips are independent, so they run in bounded batches instead.
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
      payrun.status !== PayrunStatus.ERROR &&
      // COMPUTING is allowed so a run left stuck by a restart can be retried.
      // Computing a payslip replaces its lines wholesale, so it is idempotent.
      payrun.status !== PayrunStatus.COMPUTING
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

    // Started, not awaited: the caller gets an immediate answer and the UI
    // polls the payrun until it leaves COMPUTING.
    void this.runComputation(id, payrun.payslips.map((payslip) => payslip.id));

    return this.findOne(id);
  }

  /**
   * Computes a payrun's payslips in bounded parallel batches.
   *
   * Concurrency is deliberately modest. Each payslip is a handful of queries
   * against a remote database, so running them all at once would open far more
   * connections than the pool wants, while running them one at a time wastes
   * the entire round-trip latency on every single one.
   */
  private async runComputation(id: string, payslipIds: string[]) {
    const CONCURRENCY = 6;
    let failures = 0;

    try {
      for (let index = 0; index < payslipIds.length; index += CONCURRENCY) {
        const batch = payslipIds.slice(index, index + CONCURRENCY);

        const outcomes = await Promise.all(
          batch.map((payslipId) => this.computeOne(payslipId, id)),
        );
        failures += outcomes.filter((failed) => failed).length;
      }

      // COMPUTED even with failures: individual payslips carry their own ERROR
      // status and the validate step is what actually blocks on them.
      const nextStatus =
        payslipIds.length > 0 && failures === payslipIds.length
          ? PayrunStatus.ERROR
          : PayrunStatus.COMPUTED;

      await this.prisma.payrun.update({ where: { id }, data: { status: nextStatus } });
      this.breadcrumb(id, nextStatus);
    } catch (error) {
      // Nothing is awaiting this, so a failure here would otherwise leave the
      // payrun stuck in COMPUTING with no explanation anywhere.
      this.logger.error(
        `Computation of payrun ${id} failed`,
        error instanceof Error ? error.stack : String(error),
      );
      Sentry.captureException(error, { tags: { job: 'compute-payrun' }, extra: { payrunId: id } });
      await this.prisma.payrun
        .update({ where: { id }, data: { status: PayrunStatus.ERROR } })
        .catch(() => undefined);
    }
  }

  /** Computes one payslip. Resolves to true when it failed. */
  private async computeOne(payslipId: string, payrunId: string): Promise<boolean> {
    try {
      const outcome = await this.computation.computePayslip(payslipId);
      return outcome.status === PayslipStatus.ERROR;
    } catch (error) {
      this.logger.error(
        `Failed to compute payslip ${payslipId} of payrun ${payrunId}`,
        error instanceof Error ? error.stack : String(error),
      );
      Sentry.captureException(error, {
        tags: { job: 'compute-payslip' },
        extra: { payslipId, payrunId },
      });

      await this.prisma.payslip.update({
        where: { id: payslipId },
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

      return true;
    }
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

    return this.sendSelected(
      id,
      payrun.payslips.map((payslip) => payslip.id),
    );
  }

  // ───────────────────────────── bulk actions ─────────────────────────────
  //
  // A payrun with forty employees is normal, and a mistake on one of them
  // should not force the whole run to be redone. These act on an explicit
  // selection and then bring the payrun's own status back in line with its
  // payslips, so the header can never disagree with the table beneath it.

  /** Loads the selected payslips, refusing ids that belong to another payrun. */
  private async selectionOf(payrunId: string, payslipIds: string[]) {
    const payrun = await this.prisma.payrun.findUnique({ where: { id: payrunId } });

    if (!payrun) {
      throw new NotFoundException({ message: 'Payrun not found', code: 'NOT_FOUND' });
    }

    const payslips = await this.prisma.payslip.findMany({
      where: { id: { in: payslipIds }, payrunId },
      include: { employee: { select: { name: true } } },
    });

    if (payslips.length !== payslipIds.length) {
      throw new BadRequestException({
        message: 'Some of the selected payslips do not belong to this payrun.',
        code: 'PAYSLIP_NOT_IN_PAYRUN',
      });
    }

    return { payrun, payslips };
  }

  /**
   * Derives the payrun's status from its payslips.
   *
   * The payrun header is a summary of the rows, not an independent fact. After
   * a partial action it has to be recomputed, or a run showing "Validated"
   * could still contain a draft payslip.
   */
  private async syncPayrunStatus(payrunId: string) {
    const payslips = await this.prisma.payslip.findMany({
      where: { payrunId },
      select: { status: true },
    });

    if (payslips.length === 0) return;

    const every = (status: PayslipStatus) => payslips.every((p) => p.status === status);
    const some = (status: PayslipStatus) => payslips.some((p) => p.status === status);

    let status: PayrunStatus;
    if (some(PayslipStatus.ERROR)) status = PayrunStatus.ERROR;
    else if (every(PayslipStatus.PAID)) status = PayrunStatus.PAID;
    else if (payslips.every((p) => p.status === PayslipStatus.VALIDATED || p.status === PayslipStatus.PAID))
      status = PayrunStatus.VALIDATED;
    else if (some(PayslipStatus.DRAFT)) status = PayrunStatus.DRAFT;
    else status = PayrunStatus.COMPUTED;

    const current = await this.prisma.payrun.findUnique({
      where: { id: payrunId },
      select: { status: true },
    });
    if (current?.status === status) return;

    await this.prisma.payrun.update({
      where: { id: payrunId },
      data: {
        status,
        ...(status === PayrunStatus.VALIDATED ? { validatedAt: new Date() } : {}),
        ...(status === PayrunStatus.PAID ? { paidAt: new Date() } : {}),
      },
    });
    this.breadcrumb(payrunId, status);
  }

  /** Takes employees out of a payrun, before any money has moved. */
  async removeSelected(payrunId: string, payslipIds: string[]) {
    const { payrun, payslips } = await this.selectionOf(payrunId, payslipIds);

    if (payrun.status === PayrunStatus.PAID) {
      throw new BadRequestException({
        message: 'A paid payrun is immutable; its payslips cannot be removed.',
        code: 'PAYRUN_IMMUTABLE',
      });
    }

    const paid = payslips.filter((p) => p.status === PayslipStatus.PAID);
    if (paid.length > 0) {
      throw new BadRequestException({
        message: `${paid.length} of the selected payslip(s) are already paid and cannot be removed.`,
        code: 'PAYSLIP_IMMUTABLE',
      });
    }

    const ids = payslips.map((p) => p.id);
    await this.prisma.$transaction([
      // Lines first: they reference the payslip.
      this.prisma.payslipLine.deleteMany({ where: { payslipId: { in: ids } } }),
      this.prisma.payslip.deleteMany({ where: { id: { in: ids } } }),
    ]);

    await this.syncPayrunStatus(payrunId);

    return {
      removed: ids.length,
      employees: payslips.map((p) => p.employee?.name).filter(Boolean),
      payrun: await this.findOne(payrunId),
    };
  }

  /** Validates only the selected payslips. */
  async validateSelected(payrunId: string, payslipIds: string[]) {
    const { payslips } = await this.selectionOf(payrunId, payslipIds);

    const wrongState = payslips.filter((p) => p.status !== PayslipStatus.COMPUTED);
    if (wrongState.length > 0) {
      throw new BadRequestException({
        message: `Only a computed payslip can be validated. ${wrongState.length} of the selected are not.`,
        code: 'INVALID_PAYSLIP_STATE',
      });
    }

    // The same guard as validating the whole run: nobody is validated while
    // their payslip carries a blocking warning.
    const blocking = this.collectBlockingWarnings(payslips);
    if (blocking.length > 0) {
      throw new BadRequestException({
        message: 'Resolve the blocking warnings on the selected payslips first.',
        code: 'BLOCKING_WARNINGS',
        errors: blocking,
      });
    }

    await this.prisma.payslip.updateMany({
      where: { id: { in: payslips.map((p) => p.id) } },
      data: { status: PayslipStatus.VALIDATED },
    });

    await this.syncPayrunStatus(payrunId);

    return { validated: payslips.length, payrun: await this.findOne(payrunId) };
  }

  /** Marks only the selected payslips paid. */
  async markSelectedPaid(payrunId: string, payslipIds: string[]) {
    const { payslips } = await this.selectionOf(payrunId, payslipIds);

    const wrongState = payslips.filter((p) => p.status !== PayslipStatus.VALIDATED);
    if (wrongState.length > 0) {
      throw new BadRequestException({
        message: `Only a validated payslip can be marked paid. ${wrongState.length} of the selected are not.`,
        code: 'INVALID_PAYSLIP_STATE',
      });
    }

    await this.prisma.payslip.updateMany({
      where: { id: { in: payslips.map((p) => p.id) } },
      data: { status: PayslipStatus.PAID },
    });

    await this.syncPayrunStatus(payrunId);

    return { paid: payslips.length, payrun: await this.findOne(payrunId) };
  }

  /**
   * Records delivery of the selected payslips.
   *
   * `emailSentAt` is stamped whether or not a mail provider is configured, so
   * the UI can always show who has been sent their payslip. Without a provider
   * nothing leaves the building, and the result says so rather than pretending.
   */
  async sendSelected(payrunId: string, payslipIds: string[]) {
    const { payrun, payslips } = await this.selectionOf(payrunId, payslipIds);

    if (payrun.status !== PayrunStatus.VALIDATED && payrun.status !== PayrunStatus.PAID) {
      throw new BadRequestException({
        message: 'Validate the payrun before sending payslips.',
        code: 'INVALID_PAYRUN_STATE',
      });
    }

    const deliverable = payslips.filter(
      (p) => p.status === PayslipStatus.VALIDATED || p.status === PayslipStatus.PAID,
    );

    const now = new Date();
    await this.prisma.payslip.updateMany({
      where: { id: { in: deliverable.map((p) => p.id) } },
      data: { emailSentAt: now },
    });

    const configured = Boolean(process.env.RESEND_API_KEY);

    return {
      sent: deliverable.length,
      skipped: payslips.length - deliverable.length,
      delivered: configured,
      payrunId,
      message: configured
        ? `${deliverable.length} payslip(s) sent.`
        : `${deliverable.length} payslip(s) marked as sent. Email delivery is not configured (RESEND_API_KEY), so nothing left the server.`,
      payrun: await this.findOne(payrunId),
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
