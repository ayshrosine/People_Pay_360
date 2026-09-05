import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PayslipStatus } from '@prisma/client';

@Injectable()
export class PayslipsService {
  constructor(private prisma: PrismaService) {}

  async findAll(payrunId?: string, employeeId?: string, status?: string) {
    const where: any = {};
    
    if (payrunId) {
      where.payrunId = payrunId;
    }
    
    if (employeeId) {
      where.employeeId = employeeId;
    }
    
    if (status) {
      where.status = status;
    }

    return this.prisma.payslip.findMany({
      where,
      include: {
        payrun: true,
        employee: true,
        lines: {
          orderBy: { sequence: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id },
      include: {
        payrun: {
          include: {
            salaryStructure: true,
          },
        },
        employee: true,
        lines: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!payslip) {
      throw new NotFoundException('Payslip not found');
    }

    return payslip;
  }

  async getPdf(id: string) {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id },
    });

    if (!payslip) {
      throw new NotFoundException('Payslip not found');
    }

    if (!payslip.pdfUrl) {
      // In a real implementation, this would trigger PDF generation
      throw new BadRequestException('PDF not yet generated');
    }

    return {
      url: payslip.pdfUrl,
    };
  }

  async recompute(id: string) {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id },
      include: {
        payrun: true,
        employee: true,
      },
    });

    if (!payslip) {
      throw new NotFoundException('Payslip not found');
    }

    if (payslip.payrun.status === 'PAID') {
      throw new BadRequestException('Cannot recompute payslip from a paid payrun');
    }

    // In a real implementation, this would recompute using the rule engine
    // For now, we'll just update the status
    const updatedPayslip = await this.prisma.payslip.update({
      where: { id },
      data: {
        status: PayslipStatus.DRAFT,
      },
      include: {
        payrun: true,
        employee: true,
        lines: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    return updatedPayslip;
  }
}
