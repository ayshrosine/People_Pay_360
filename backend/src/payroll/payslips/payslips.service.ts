import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma, PayslipStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PayslipComputationService } from './payslip-computation.service';
import { PayslipPdfService } from './payslip-pdf.service';

@Injectable()
export class PayslipsService {
  private readonly logger = new Logger(PayslipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly computation: PayslipComputationService,
    private readonly pdf: PayslipPdfService,
  ) {}

  async findAll(params: {
    payrunId?: string;
    employeeId?: string;
    status?: PayslipStatus;
    page?: number;
    limit?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 25;

    const where: Prisma.PayslipWhereInput = {
      ...(params.payrunId ? { payrunId: params.payrunId } : {}),
      ...(params.employeeId ? { employeeId: params.employeeId } : {}),
      ...(params.status ? { status: params.status } : {}),
    };

    const [payslips, total] = await this.prisma.$transaction([
      this.prisma.payslip.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          payrun: { select: { id: true, name: true, periodStart: true, periodEnd: true } },
          employee: { include: { department: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payslip.count({ where }),
    ]);

    return { data: payslips, meta: { total, page, limit } };
  }

  async findOne(id: string) {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id },
      include: {
        payrun: { include: { salaryStructure: true } },
        employee: { include: { department: true } },
        lines: { orderBy: { sequence: 'asc' } },
      },
    });

    if (!payslip) {
      throw new NotFoundException({ message: 'Payslip not found', code: 'NOT_FOUND' });
    }

    return payslip;
  }

  /**
   * Returns a URL the browser can open. If the PDF has not been rendered yet it
   * is generated on demand and cached on the payslip, so repeat downloads are
   * a single lookup.
   */
  async getPdf(id: string) {
    const payslip = await this.findOne(id);

    if (payslip.pdfUrl) {
      return { url: payslip.pdfUrl };
    }

    const url = await this.pdf.generateAndStore(payslip);

    await this.prisma.payslip.update({ where: { id }, data: { pdfUrl: url } });

    return { url };
  }

  /** Renders the payslip PDF inline, for environments with no object storage. */
  async renderPdfBuffer(id: string): Promise<Buffer> {
    const payslip = await this.findOne(id);
    return this.pdf.render(payslip);
  }

  /**
   * Re-runs the rule engine for a single payslip. Blocked once the payrun is
   * PAID — a paid payslip is a financial record and must never change.
   */
  async recompute(id: string) {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id },
      include: { payrun: { select: { status: true } } },
    });

    if (!payslip) {
      throw new NotFoundException({ message: 'Payslip not found', code: 'NOT_FOUND' });
    }

    if (payslip.payrun.status === 'PAID') {
      throw new BadRequestException({
        message: 'A payslip belonging to a paid payrun is immutable.',
        code: 'PAYRUN_IMMUTABLE',
      });
    }

    // The cached PDF describes the pre-recompute numbers, so drop it.
    await this.prisma.payslip.update({ where: { id }, data: { pdfUrl: null } });

    await this.computation.computePayslip(id);

    return this.findOne(id);
  }

  /**
   * Plain-English explanation of how the payslip was computed, built from the
   * persisted line snapshot rather than from live rules.
   */
  async explain(id: string) {
    const payslip = await this.findOne(id);

    if (payslip.lines.length === 0) {
      return {
        summary: 'This payslip has not been computed yet, so there is nothing to explain.',
        steps: [],
      };
    }

    const currency = (value: Prisma.Decimal | number) =>
      Number(value).toLocaleString('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
      });

    const steps = payslip.lines.map((line) => {
      const amount = currency(line.amount);
      switch (line.category) {
        case 'BASIC':
          return `${line.label} is ${amount}, the base your other components are calculated from.`;
        case 'ALLOWANCE':
          return `${line.label} adds ${amount} on top of your basic pay.`;
        case 'DEDUCTION':
          return `${line.label} takes ${amount} off your gross pay.`;
        case 'GROSS':
          return `That brings your gross pay to ${amount}.`;
        case 'NET':
          return `After deductions, your net take-home is ${amount}.`;
        default:
          return `${line.label}: ${amount}.`;
      }
    });

    return {
      summary:
        `For ${payslip.payrun.name}, you worked ${payslip.workedDays} day(s). ` +
        `Your gross pay is ${currency(payslip.grossAmount)} and your net take-home is ` +
        `${currency(payslip.netAmount)}.`,
      steps,
    };
  }
}
