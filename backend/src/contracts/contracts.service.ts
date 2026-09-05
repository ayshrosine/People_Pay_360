import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractStatus } from '@prisma/client';

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService) {}

  async findAll(employeeId?: string) {
    const where = employeeId ? { employeeId } : {};
    return this.prisma.contract.findMany({
      where,
      include: {
        employee: true,
        salaryStructure: true,
        workingSchedule: true,
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async getActiveContract(employeeId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();

    const contract = await this.prisma.contract.findFirst({
      where: {
        employeeId,
        status: ContractStatus.RUNNING,
        startDate: { lte: targetDate },
        OR: [
          { endDate: null },
          { endDate: { gte: targetDate } },
        ],
      },
      include: {
        employee: true,
        salaryStructure: true,
        workingSchedule: true,
      },
    });

    return contract;
  }

  async findOne(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        employee: true,
        salaryStructure: true,
        workingSchedule: true,
      },
    });

    if (!contract) {
      throw new NotFoundException({ message: 'Contract not found', code: 'NOT_FOUND' });
    }

    return contract;
  }

  async create(createContractDto: CreateContractDto) {
    // Check for overlapping RUNNING contracts
    await this.checkForOverlappingContracts(
      createContractDto.employeeId,
      new Date(createContractDto.startDate),
      createContractDto.endDate ? new Date(createContractDto.endDate) : null,
    );

    return this.prisma.contract.create({
      data: {
        employeeId: createContractDto.employeeId,
        department: createContractDto.department,
        jobPosition: createContractDto.jobPosition,
        startDate: new Date(createContractDto.startDate),
        endDate: createContractDto.endDate ? new Date(createContractDto.endDate) : null,
        wage: createContractDto.wage,
        wageType: createContractDto.wageType || 'Monthly',
        salaryStructureId: createContractDto.salaryStructureId,
        workingScheduleId: createContractDto.workingScheduleId,
        status: createContractDto.status || ContractStatus.DRAFT,
      },
      include: {
        employee: true,
        salaryStructure: true,
        workingSchedule: true,
      },
    });
  }

  async update(id: string, updateContractDto: UpdateContractDto) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
    });

    if (!contract) {
      throw new NotFoundException({ message: 'Contract not found', code: 'NOT_FOUND' });
    }

    // If status is being set to RUNNING, check for overlaps
    if (updateContractDto.status === ContractStatus.RUNNING) {
      const startDate = updateContractDto.startDate 
        ? new Date(updateContractDto.startDate) 
        : contract.startDate;
      const endDate = updateContractDto.endDate 
        ? new Date(updateContractDto.endDate) 
        : contract.endDate;

      await this.checkForOverlappingContracts(
        contract.employeeId,
        startDate,
        endDate,
        id, // Exclude current contract from overlap check
      );
    }

    return this.prisma.contract.update({
      where: { id },
      data: {
        employeeId: updateContractDto.employeeId,
        department: updateContractDto.department,
        jobPosition: updateContractDto.jobPosition,
        startDate: updateContractDto.startDate ? new Date(updateContractDto.startDate) : contract.startDate,
        endDate: updateContractDto.endDate ? new Date(updateContractDto.endDate) : contract.endDate,
        wage: updateContractDto.wage !== undefined ? updateContractDto.wage : contract.wage,
        wageType: updateContractDto.wageType || contract.wageType,
        salaryStructureId: updateContractDto.salaryStructureId,
        workingScheduleId: updateContractDto.workingScheduleId,
        status: updateContractDto.status,
      },
      include: {
        employee: true,
        salaryStructure: true,
        workingSchedule: true,
      },
    });
  }

  async remove(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
    });

    if (!contract) {
      throw new NotFoundException({ message: 'Contract not found', code: 'NOT_FOUND' });
    }

    return this.prisma.contract.delete({
      where: { id },
    });
  }

  private async checkForOverlappingContracts(
    employeeId: string,
    startDate: Date,
    endDate: Date | null,
    excludeContractId?: string,
  ) {
    const overlappingContracts = await this.prisma.contract.findMany({
      where: {
        employeeId,
        status: ContractStatus.RUNNING,
        id: excludeContractId ? { not: excludeContractId } : undefined,
        OR: [
          // New contract starts during an existing contract
          {
            startDate: { lte: startDate },
            OR: [
              { endDate: null },
              ...(endDate ? [{ endDate: { gte: startDate } }] : []),
            ],
          },
          // New contract ends during an existing contract
          ...(endDate ? [{
            startDate: { lte: endDate },
            OR: [
              { endDate: null },
              { endDate: { gte: endDate } },
            ],
          }] : []),
          // New contract completely encompasses an existing contract
          ...(endDate ? [{
            startDate: { gte: startDate },
            OR: [
              { endDate: null },
              { endDate: { lte: endDate } },
            ],
          }] : []),
        ],
      },
    });

    if (overlappingContracts.length > 0) {
      throw new ConflictException({
        message: 'This employee already has an active contract covering this period.',
        code: 'OVERLAPPING_CONTRACT',
      });
    }
  }
}
