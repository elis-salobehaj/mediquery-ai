import { describe, it, expect } from 'vitest';
import {
  autoCorrectTableNames,
  classifySqlOperation,
  enforceReadOnlySql,
  enforceSqlComplexity,
} from '@/ai/common';

describe('autoCorrectTableNames', () => {
  const validTables = new Set([
    'person',
    'visit_occurrence',
    'measurement',
    'condition_occurrence',
    'drug_exposure',
  ]);

  it('maps generic terms to supported table names only', () => {
    const input = 'SELECT * FROM labs WHERE patient IS NOT NULL';
    const result = autoCorrectTableNames(input, validTables);

    expect(result.correctedSql).toContain('measurement');
    expect(result.correctedSql).toContain('person');
  });

  it('never introduces forbidden legacy table names', () => {
    const input = 'SELECT * FROM kpi WHERE visit IS NOT NULL';
    const result = autoCorrectTableNames(input, validTables);

    expect(result.correctedSql).not.toContain('lab_results');
    expect(result.correctedSql).not.toContain('medical_data_kpis');
    expect(result.correctedSql).toContain('visit_occurrence');
    expect(result.correctedSql).not.toContain('labss');
  });
});

describe('phase6 sql policy utilities', () => {
  it('classifies read-only and write sql operations', () => {
    expect(classifySqlOperation('SELECT * FROM person')).toBe('READ_ONLY');
    expect(classifySqlOperation('UPDATE person SET a = 1')).toBe('WRITE');
    expect(classifySqlOperation('DROP TABLE person')).toBe('DDL');
  });

  it('blocks non read-only sql', () => {
    expect(enforceReadOnlySql('DELETE FROM person').allowed).toBe(false);
    expect(
      enforceReadOnlySql('WITH cte AS (SELECT 1) SELECT * FROM cte').allowed,
    ).toBe(true);
  });

  it('enforces complexity policy for high-join no-limit queries', () => {
    const sql = `
      SELECT *
      FROM a
      JOIN b ON a.id = b.id
      JOIN c ON b.id = c.id
      JOIN d ON c.id = d.id
      JOIN e ON d.id = e.id
    `;

    const result = enforceSqlComplexity(sql);
    expect(result.allowed).toBe(false);
    expect(result.issues.join(' ')).toContain('LIMIT');
  });
});
