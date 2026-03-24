import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateBenchmarkCases } from '@/ai/benchmarks/dev-benchmark';

describe('dev benchmark harness', () => {
  it('computes policy and sql metrics for benchmark corpus', async () => {
    const summary = await evaluateBenchmarkCases();

    expect(summary.mode).toBe('development');
    expect(summary.totals.cases).toBeGreaterThan(0);
    expect(summary.accuracy.policy_gate).toBeGreaterThanOrEqual(0);
    expect(summary.accuracy.policy_gate).toBeLessThanOrEqual(1);
    expect(summary.accuracy.sql_policy).toBeGreaterThanOrEqual(0);
    expect(summary.accuracy.sql_policy).toBeLessThanOrEqual(1);
  });

  it('loads and evaluates OMOP golden corpus with new accuracy metrics', async () => {
    const summary = await evaluateBenchmarkCases();

    // Golden corpus should be loaded
    expect(summary.totals.golden_queries).toBeGreaterThanOrEqual(25);

    // Table selection and concept join accuracy must be valid ratios
    expect(summary.accuracy.table_selection).toBeGreaterThanOrEqual(0);
    expect(summary.accuracy.table_selection).toBeLessThanOrEqual(1);
    expect(summary.accuracy.concept_join).toBeGreaterThanOrEqual(0);
    expect(summary.accuracy.concept_join).toBeLessThanOrEqual(1);
    expect(summary.execution_mode).toBe('mode-a');
    expect(summary.accuracy.sql_execution).toBeGreaterThanOrEqual(0);
    expect(summary.accuracy.sql_execution).toBeLessThanOrEqual(1);

    // Per-category breakdown should exist for core OMOP categories
    const categories = Object.keys(summary.by_category);
    expect(categories).toContain('demographics');
    expect(categories).toContain('conditions');
    expect(categories).toContain('medications');
    expect(categories).toContain('measurements');
    expect(categories).toContain('visits');
    expect(categories).toContain('cross_domain');
    expect(categories).toContain('edge_cases');

    // Golden results array matches totals
    expect(summary.golden_results).toHaveLength(summary.totals.golden_queries);
  });

  it('golden corpus SQL queries all use omop_vocab.concept when concept join is needed', async () => {
    const summary = await evaluateBenchmarkCases();

    const failingConceptJoins = summary.golden_results.filter(
      (r) => r.needsConceptJoin && !r.hasConceptJoin,
    );
    expect(failingConceptJoins).toHaveLength(0);
  });

  it('golden corpus SQL queries reference all expected OMOP tables', async () => {
    const summary = await evaluateBenchmarkCases();

    const missingTables = summary.golden_results.filter((r) => r.expectedTablesMissing.length > 0);
    expect(missingTables).toHaveLength(0);
  });

  it('golden corpus entries include expected_joins metadata', async () => {
    const corpusPath = resolve(process.cwd(), 'src/ai/benchmarks/corpus/omop_golden_queries.jsonl');
    const lines = readFileSync(corpusPath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const parsed = JSON.parse(line) as { expected_joins?: unknown };
      expect(Array.isArray(parsed.expected_joins)).toBe(true);
    }
  });
});
