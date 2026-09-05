import { Injectable } from '@nestjs/common';
import { SalaryRule } from '@prisma/client';
import { create, all, MathJsInstance } from 'mathjs';

export interface RuleContext {
  [code: string]: number;
}

export interface ComputedLine {
  ruleCode: string;
  label: string;
  category: string;
  amount: number;
  sequence: number;
}

export interface RuleEngineResult {
  context: RuleContext;
  lines: ComputedLine[];
}

export interface BaseContext {
  basicWage: number;
  workedDays: number;
  totalDays: number;
}

/**
 * Identifiers that would give a formula author a way out of the sandbox.
 * mathjs can define functions, import modules and create units at runtime;
 * a salary rule has no business doing any of that.
 */
const FORBIDDEN_TOKENS = [
  'import',
  'createUnit',
  'evaluate',
  'parse',
  'simplify',
  'derivative',
  'compile',
  'help',
  'constructor',
  'prototype',
  '__proto__',
  'process',
  'require',
  'globalThis',
];

@Injectable()
export class RuleEngineService {
  /**
   * A dedicated mathjs instance with the dangerous entry points removed, so a
   * formula stored in the database can never reach the host runtime.
   */
  private readonly math: MathJsInstance;

  constructor() {
    this.math = create(all, { matrix: 'Array' });
    // Only the *runtime extension* entry points are disabled. `evaluate` and
    // `parse` must stay intact - they are how this service runs a formula at
    // all - and expression-level abuse is caught by the token blocklist below.
    this.math.import(
      {
        import: () => {
          throw new Error('import is disabled in salary formulas');
        },
        createUnit: () => {
          throw new Error('createUnit is disabled in salary formulas');
        },
      },
      { override: true },
    );
  }

  /**
   * Runs the structure's rules in `sequence` order. Each result is written back
   * into the shared context under the rule's `code`, so a later rule (NET) can
   * reference an earlier one (GROSS - DEDUCTIONS).
   */
  run(rules: SalaryRule[], baseContext: BaseContext): RuleEngineResult {
    const context: RuleContext = {
      basicWage: baseContext.basicWage,
      workedDays: baseContext.workedDays,
      totalDays: baseContext.totalDays,
      // Seeded so a structure without an explicit BASIC rule still has a base
      // to pro-rate against; a real BASIC rule overwrites this on its turn.
      BASIC: baseContext.basicWage,
    };

    const lines: ComputedLine[] = [];
    const sorted = [...rules].sort((a, b) => a.sequence - b.sequence);

    for (const rule of sorted) {
      if (!rule.active) continue;

      if (rule.condition && !this.evalCondition(rule.condition, context)) {
        continue;
      }

      const value = this.computeRule(rule, context);

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

  private computeRule(rule: SalaryRule, context: RuleContext): number {
    switch (rule.computationType) {
      case 'FIXED':
        return this.toFiniteNumber(rule.amount, `rule ${rule.code} has no amount`);

      case 'PERCENTAGE': {
        if (!rule.percentageOf) {
          throw new Error(`Rule ${rule.code} is PERCENTAGE but has no percentageOf base`);
        }
        const base = context[rule.percentageOf];
        if (typeof base !== 'number') {
          throw new Error(
            `Rule ${rule.code} references "${rule.percentageOf}", which has not been computed yet. ` +
              'Check the rule sequence.',
          );
        }
        const pct = this.toFiniteNumber(
          rule.percentageValue,
          `rule ${rule.code} has no percentageValue`,
        );
        return base * (pct / 100);
      }

      case 'FORMULA':
      case 'PYTHON_LIKE':
        if (!rule.formula) {
          throw new Error(`Rule ${rule.code} is FORMULA but has no formula`);
        }
        return this.evalSafe(rule.formula, context);

      default:
        return 0;
    }
  }

  /** A condition guards whether a rule runs at all; non-zero/true means run. */
  private evalCondition(expression: string, context: RuleContext): boolean {
    const result = this.evaluateExpression(expression, context);
    if (typeof result === 'boolean') return result;
    if (typeof result === 'number') return result !== 0;
    return Boolean(result);
  }

  private evalSafe(expression: string, scope: RuleContext): number {
    const result = this.evaluateExpression(expression, scope);
    const numeric = typeof result === 'number' ? result : Number(result);

    if (!Number.isFinite(numeric)) {
      throw new Error(`Expression "${expression}" did not evaluate to a finite number`);
    }

    return numeric;
  }

  private evaluateExpression(expression: string, scope: RuleContext): unknown {
    this.assertExpressionIsSafe(expression);

    try {
      // A copy, because mathjs writes assignments back into the scope it is
      // given and a formula must not be able to mutate the shared context.
      return this.math.evaluate(expression, { ...scope });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to evaluate "${expression}": ${message}`);
    }
  }

  private assertExpressionIsSafe(expression: string): void {
    if (typeof expression !== 'string' || expression.trim().length === 0) {
      throw new Error('Expression is empty');
    }
    if (expression.length > 500) {
      throw new Error('Expression is too long (max 500 characters)');
    }

    const lowered = expression.toLowerCase();
    for (const token of FORBIDDEN_TOKENS) {
      if (lowered.includes(token.toLowerCase())) {
        throw new Error(`Expression contains the disallowed token "${token}"`);
      }
    }
  }

  private toFiniteNumber(value: unknown, errorMessage: string): number {
    if (value === null || value === undefined) {
      throw new Error(errorMessage);
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new Error(errorMessage);
    }
    return numeric;
  }

  /**
   * Dry-runs a formula for the live rule editor: returns the sample result or
   * the parse error, without ever throwing at the caller.
   */
  validateFormula(
    formula: string,
    context: RuleContext,
  ): { valid: boolean; result?: number; error?: string } {
    try {
      return { valid: true, result: this.evalSafe(formula, context) };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
