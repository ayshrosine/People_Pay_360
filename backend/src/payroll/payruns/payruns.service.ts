import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePayrunDto } from './dto/create-payrun.dto';
import { PreviewScopeDto } from './dto/preview-scope.dto';
import { PayrunStatus, PayslipStatus } from '@prisma/client';

@Injectable()
export class PayrunsService {
  constructor(private prisma: PrismaService) {}

  async previewScope(previewScopeDto: PreviewScopeDto) {
    const { salaryStructureId, periodStart, periodEnd, employeeType } = previewScopeDto;

    // Get employees with active contracts in the period
    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);

    const employees = await this.prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        employeeType: employeeType || undefined,
        contracts: {
          some: {
            status: 'RUNNING',
            startDate: { lte: endDate },
            OR: [
              { endDate: null },
              { endDate: { gte: startDate } },
            ],
          },
        },
      },
      include: {
        contracts: {
          where: {
            status: 'RUNNING',
            startDate: { lte: endDate },
            OR: [
              { endDate: null },
              { endDate: { gte: startDate } },
            ],
          },
          include: {
            salaryStructure: true,
          },
        },
      },
    });

    return {
      eligibleEmployees: employees.map(emp => ({
        id: emp.id,
        name: emp.name,
        workEmail: emp.workEmail,
        employeeType: emp.employeeType,
        department: emp.departmentId,
        applicableContract: emp.contracts[0] || null,
      })),
    };
  }

  async findAll() {
    return this.prisma.payrun.findMany({
      include: {
        salaryStructure: true,
        payslips: {
          include: {
            employee: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const payrun = await this.prisma.payrun.findUnique({
      where: { id },
      include: {
        salaryStructure: true,
        payslips: {
          include: {
            employee: true,
            lines: {
              orderBy: { sequence: 'asc' },
            },
          },
        },
      },
    });

    if (!payrun) {
      throw new NotFoundException('Payrun not found');
    }

    return payrun;
  }

  async create(createPayrunDto: CreatePayrunDto, createdById: string) {
    const { name, salaryStructureId, periodStart, periodEnd, employeeType, employeeIds } = createPayrunDto;

    // Verify salary structure exists
    const salaryStructure = await this.prisma.salaryStructure.findUnique({
      where: { id: salaryStructureId },
    });

    if (!salaryStructure) {
      throw new NotFoundException('Salary structure not found');
    }

    // Verify all employees exist
    const employees = await this.prisma.employee.findMany({
      where: {
        id: { in: employeeIds },
      },
    });

    if (employees.length !== employeeIds.length) {
      throw new BadRequestException('One or more employees not found');
    }

    // Create payrun with payslips
    const payrun = await this.prisma.payrun.create({
      data: {
        name,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        salaryStructureId,
        employeeType,
        status: PayrunStatus.DRAFT,
        createdById,
        payslips: {
          create: employeeIds.map(employeeId => ({
            employeeId,
            contractId: '', // Will be resolved during computation
            workedDays: 0,
            grossAmount: 0,
            netAmount: 0,
            status: PayslipStatus.DRAFT,
          })),
        },
      },
      include: {
        salaryStructure: true,
        payslips: {
          include: {
            employee: true,
          },
        },
      },
    });

    return payrun;
  }

  async compute(id: string) {
    const payrun = await this.prisma.payrun.findUnique({
      where: { id },
      include: {
        salaryStructure: {
          include: {
            rules: {
              orderBy: { sequence: 'asc' },
            },
          },
        },
        payslips: {
          include: {
            employee: true,
          },
        },
      },
    });

    if (!payrun) {
      throw new NotFoundException('Payrun not found');
    }

    if (payrun.status !== PayrunStatus.DRAFT) {
      throw new BadRequestException('Payrun is not in DRAFT status');
    }

    // Update payrun status to COMPUTING
    await this.prisma.payrun.update({
      where: { id },
      data: { status: PayrunStatus.COMPUTING },
    });

    // In a real implementation, this would enqueue BullMQ jobs
    // For now, we'll compute synchronously
    const startDate = payrun.periodStart;
    const endDate = payrun.periodEnd;

    for (const payslip of payrun.payslips) {
      // Resolve applicable contract
      const contract = await this.prisma.contract.findFirst({
        where: {
          employeeId: payslip.employeeId,
          status: 'RUNNING',
          startDate: { lte: endDate },
          OR: [
            { endDate: null },
            { endDate: { gte: startDate } },
          ],
        },
      });

      if (!contract) {
        // Mark payslip as error
        await this.prisma.payslip.update({
          where: { id: payslip.id },
          data: {
            status: PayslipStatus.ERROR,
            warnings: [
              {
                code: 'NO_ACTIVE_CONTRACT',
                severity: 'blocking',
                message: 'No active contract found for the payroll period',
              },
            ],
          },
        });
        continue;
      }

      // Calculate worked days from attendance
      const attendanceRecords = await this.prisma.attendance.findMany({
        where: {
          employeeId: payslip.employeeId,
          checkIn: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      const workedDays = attendanceRecords.length;

      // Calculate total days in period
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      // Run rule engine
      // This would use the RuleEngineService in a real implementation
      // For now, we'll do a simple calculation
      const basicWage = Number(contract.wage);
      const grossAmount = basicWage; // Simplified
      const netAmount = grossAmount * 0.9; // Simplified (10% deduction)

      // Update payslip
      await this.prisma.payslip.update({
        where: { id: payslip.id },
        data: {
          contractId: contract.id,
          workedDays,
          grossAmount,
          netAmount,
          status: PayslipStatus.COMPUTED,
          warnings: [],
        },
      });
    }

    // Update payrun status to COMPUTED
    const updatedPayrun = await this.prisma.payrun.update({
      where: { id },
      data: { status: PayrunStatus.COMPUTED },
      include: {
        salaryStructure: true,
        payslips: {
          include: {
            employee: true,
          },
        },
      },
    });

    return updatedPayrun;
  }

  async validate(id: string) {
    const payrun = await this.prisma.payrun.findUnique({
      where: { id },
      include: {
        payslips: true,
      },
    });

    if (!payrun) {
      throw new NotFoundException('Payrun not found');
    }

    if (payrun.status !== PayrunStatus.COMPUTED) {
      throw new BadRequestException('Payrun is not in COMPUTED status');
    }

    // Check for blocking warnings
    const payslipsWithErrors = payrun.payslips.filter(
      payslip => payslip.status === PayslipStatus.ERROR,
    );

    if (payslipsWithErrors.length > 0) {
      throw new BadRequestException({
        message: 'Cannot validate payrun with errors',
        errors: payslipsWithErrors.map(p => ({
          payslipId: p.id,
          employeeId: p.employeeId,
          warnings: p.warnings,
        })),
      });
    }

    // Update payrun status to VALIDATED
    const updatedPayrun = await this.prisma.payrun.update({
      where: { id },
      data: {
        status: PayrunStatus.VALIDATED,
        validatedAt: new Date(),
      },
      include: {
        salaryStructure: true,
        payslips: {
          include: {
            employee: true,
          },
        },
      },
    });

    return updatedPayrun;
  }

  async markPaid(id: string) {
    const payrun = await this.prisma.payrun.findUnique({
      where: { id },
    });

    if (!payrun) {
      throw new NotFoundException('Payrun not found');
    }

    if (payrun.status !== PayrunStatus.VALIDATED) {
      throw new BadRequestException('Payrun is not in VALIDATED status');
    }

    // Update payrun status to PAID
    const updatedPayrun = await this.prisma.payrun.update({
      where: { id },
      data: {
        status: PayrunStatus.PAID,
        paidAt: new Date(),
      },
      include: {
        salaryStructure: true,
        payslips: {
          include: {
            employee: true,
          },
        },
      },
    });

    // Update all payslips to PAID
    await this.prisma.payslip.updateMany({
      where: { payrunId: id },
      data: { status: PayslipStatus.PAID },
    });

    return updatedPayrun;
  }

  async sendPayslips(id: string) {
    const payrun = await this.prisma.payrun.findUnique({
      where: { id },
      include: {
        payslips: {
          include: {
            employee: true,
          },
        },
      },
    });

    if (!payrun) {
      throw new NotFoundException('Payrun not found');
    }

    if (payrun.status !== PayrunStatus.PAID) {
      throw new BadRequestException('Payrun must be PAID before sending payslips');
    }

    // In a real implementation, this would enqueue BullMQ jobs for email sending
    // For now, we'll just return success
    return {
      message: 'Payslips queued for sending',
      payrunId: id,
      payslipCount: payrun.payslips.length,
    };
  }
}
