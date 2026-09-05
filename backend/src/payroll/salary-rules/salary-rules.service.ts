import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSalaryRuleDto } from './dto/create-salary-rule.dto';
import { UpdateSalaryRuleDto } from './dto/update-salary-rule.dto';
import { ValidateRuleDto } from './dto/validate-rule.dto';
import { evaluate } from 'mathjs';

@Injectable()
export class SalaryRulesService {
  constructor(private prisma: PrismaService) {}

  async findAll(structureId: string) {
    return this.prisma.salaryRule.findMany({
      where: { structureId },
      orderBy: { sequence: 'asc' },
    });
  }

  async findOne(ruleId: string) {
    const rule = await this.prisma.salaryRule.findUnique({
      where: { id: ruleId },
      include: {
        structure: true,
      },
    });

    if (!rule) {
      throw new NotFoundException('Salary rule not found');
    }

    return rule;
  }

  async create(structureId: string, createSalaryRuleDto: CreateSalaryRuleDto) {
    // Check if the structure exists
    const structure = await this.prisma.salaryStructure.findUnique({
      where: { id: structureId },
    });

    if (!structure) {
      throw new NotFoundException('Salary structure not found');
    }

    // Check if code is unique within the structure
    const existingRule = await this.prisma.salaryRule.findFirst({
      where: {
        structureId,
        code: createSalaryRuleDto.code,
      },
    });

    if (existingRule) {
      throw new ConflictException('Rule code must be unique within the structure');
    }

    // Check if sequence is unique within the structure
    const existingSequence = await this.prisma.salaryRule.findFirst({
      where: {
        structureId,
        sequence: createSalaryRuleDto.sequence,
      },
    });

    if (existingSequence) {
      throw new ConflictException('Rule sequence must be unique within the structure');
    }

    return this.prisma.salaryRule.create({
      data: {
        structureId,
        name: createSalaryRuleDto.name,
        code: createSalaryRuleDto.code,
        category: createSalaryRuleDto.category,
        sequence: createSalaryRuleDto.sequence,
        computationType: createSalaryRuleDto.computationType,
        amount: createSalaryRuleDto.amount,
        percentageOf: createSalaryRuleDto.percentageOf,
        percentageValue: createSalaryRuleDto.percentageValue,
        formula: createSalaryRuleDto.formula,
        condition: createSalaryRuleDto.condition,
        active: createSalaryRuleDto.active !== undefined ? createSalaryRuleDto.active : true,
      },
    });
  }

  async update(ruleId: string, updateSalaryRuleDto: UpdateSalaryRuleDto) {
    const rule = await this.prisma.salaryRule.findUnique({
      where: { id: ruleId },
    });

    if (!rule) {
      throw new NotFoundException('Salary rule not found');
    }

    // Check if code is being changed and if it's unique
    if (updateSalaryRuleDto.code && updateSalaryRuleDto.code !== rule.code) {
      const existingRule = await this.prisma.salaryRule.findFirst({
        where: {
          structureId: rule.structureId,
          code: updateSalaryRuleDto.code,
        },
      });

      if (existingRule) {
        throw new ConflictException('Rule code must be unique within the structure');
      }
    }

    // Check if sequence is being changed and if it's unique
    if (updateSalaryRuleDto.sequence && updateSalaryRuleDto.sequence !== rule.sequence) {
      const existingSequence = await this.prisma.salaryRule.findFirst({
        where: {
          structureId: rule.structureId,
          sequence: updateSalaryRuleDto.sequence,
        },
      });

      if (existingSequence) {
        throw new ConflictException('Rule sequence must be unique within the structure');
      }
    }

    return this.prisma.salaryRule.update({
      where: { id: ruleId },
      data: {
        name: updateSalaryRuleDto.name,
        code: updateSalaryRuleDto.code,
        category: updateSalaryRuleDto.category,
        sequence: updateSalaryRuleDto.sequence,
        computationType: updateSalaryRuleDto.computationType,
        amount: updateSalaryRuleDto.amount,
        percentageOf: updateSalaryRuleDto.percentageOf,
        percentageValue: updateSalaryRuleDto.percentageValue,
        formula: updateSalaryRuleDto.formula,
        condition: updateSalaryRuleDto.condition,
        active: updateSalaryRuleDto.active,
      },
    });
  }

  async remove(ruleId: string) {
    const rule = await this.prisma.salaryRule.findUnique({
      where: { id: ruleId },
    });

    if (!rule) {
      throw new NotFoundException('Salary rule not found');
    }

    return this.prisma.salaryRule.delete({
      where: { id: ruleId },
    });
  }

  async validateRule(validateRuleDto: ValidateRuleDto) {
    try {
      const context = validateRuleDto.context || { BASIC: 50000, workedDays: 22, totalDays: 22 };
      const result = evaluate(validateRuleDto.formula, context);
      
      // Ensure the result is a number
      const numericResult = typeof result === 'number' ? result : parseFloat(String(result));
      
      if (isNaN(numericResult)) {
        return {
          valid: false,
          error: 'Formula does not evaluate to a number',
        };
      }
      
      return {
        valid: true,
        result: numericResult,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        error: errorMessage,
      };
    }
  }
}
