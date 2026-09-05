import { Injectable } from '@nestjs/common';
import { SalaryRule } from '@prisma/client';
import { evaluate } from 'mathjs';

export interface RuleContext {
  [code: string]: number;
}

export interface PayslipLine {
  ruleCode: string;
  label: string;
  category: string;
  amount: number;
  sequence: number;
}

export interface RuleEngineResult {
  context: RuleContext;
  lines: PayslipLine[];
}

@Injectable()
export class RuleEngineService {
  run(
    rules: SalaryRule[],
    baseContext: { basicWage: number; workedDays: number; totalDays: number },
  ): RuleEngineResult {
    const context: RuleContext = {
      ...baseContext,
      BASIC: baseContext.basicWage,
      workedDays: baseContext.workedDays,
      totalDays: baseContext.totalDays,
    };
    const lines: PayslipLine[] = [];
    const sorted = [...rules].sort((a, b) => a.sequence - b.sequence);

    for (const rule of sorted) {
      if (!rule.active) continue;

      // Check condition if present
      if (rule.condition && !this.evalSafe(rule.condition, context)) {
        continue;
      }

      let value: number;
      switch (rule.computationType) {
        case 'FIXED':
          value = Number(rule.amount);
          break;
        case 'PERCENTAGE':
          value = (context[rule.percentageOf!] ?? 0) * (Number(rule.percentageValue) / 100);
          break;
        case 'FORMULA':
        case 'PYTHON_LIKE':
          value = this.evalSafe(rule.formula!, context);
          break;
        default:
          value = 0;
      }

      // Store the result in context for subsequent rules
      context[rule.code] = value;
      lines.push({
        ruleCode: rule.code,
        label: rule.name,
        category: rule.category,
        amount: value,
        sequence: rule.sequence,
      });
    }

    return { context, lines };
  }

  private evalSafe(expr: string, scope: RuleContext): number {
    try {
      // Use mathjs for safe expression evaluation
      const result = evaluate(expr, scope);
      
      // Ensure the result is a number
      const numericResult = typeof result === 'number' ? result : parseFloat(String(result));
      
      if (isNaN(numericResult)) {
        throw new Error('Expression does not evaluate to a number');
      }
      
      return numericResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to evaluate expression "${expr}": ${errorMessage}`);
    }
  }

  // Validate a formula against a sample context
  validateFormula(formula: string, context: RuleContext): { valid: boolean; result?: number; error?: string } {
    try {
      const result = this.evalSafe(formula, context);
      return {
        valid: true,
        result,
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
