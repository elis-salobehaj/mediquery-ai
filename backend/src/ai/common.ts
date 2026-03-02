import { Logger } from '@nestjs/common';
import { GraphState } from '@/ai/state';

const logger = new Logger('AI-Common');

/**
 * Clean SQL query by removing common LLM artifacts.
 */
export function cleanSql(rawSql: string): string {
  let sql = rawSql.trim();

  // Remove special tokens
  sql = sql.replace(/<\|?[a-z]+\|?>/gi, '').trim();
  sql = sql.replace(/<s>/gi, '').replace(/<\/s>/gi, '').trim();

  // Remove markdown code fences
  sql = sql
    .replace(/```sql/gi, '')
    .replace(/```/gi, '')
    .trim();

  // Remove common prefixes (case-insensitive)
  const prefixesToRemove = [
    'answer:',
    'sql:',
    'query:',
    "here's the query:",
    'here is the query:',
    'the query is:',
    "here's the sql:",
    'here is the sql:',
    'the sql is:',
    'sql query:',
  ];

  for (const prefix of prefixesToRemove) {
    if (sql.toLowerCase().startsWith(prefix)) {
      sql = sql.slice(prefix.length).trim();
    }
  }

  // Remove trailing semicolon
  sql = sql.replace(/;$/, '');

  // Find first SQL keyword
  const sqlKeywords = [
    'SELECT',
    'WITH',
    'INSERT',
    'UPDATE',
    'DELETE',
    'CREATE',
  ];
  let firstKeywordPos = Infinity;
  for (const keyword of sqlKeywords) {
    const pos = sql.toUpperCase().indexOf(keyword);
    if (pos !== -1 && pos < firstKeywordPos) {
      firstKeywordPos = pos;
    }
  }

  // If found a keyword, start from there
  if (firstKeywordPos !== Infinity) {
    sql = sql.slice(firstKeywordPos);
  }

  return sql.trim();
}

/**
 * Auto-correct common table name hallucinations for medical domain.
 */
export function autoCorrectTableNames(
  sql: string,
  validTables: Set<string>,
): { correctedSql: string; correctionsMade: string[] } {
  const correctionsMade: string[] = [];
  let sqlCorrected = sql;

  // Map of common incorrect names to correct names (medical Domain)
  const tableCorrections: Record<string, string> = {
    '\\bpatient\\b': 'patients',
    '\\blabs\\b': 'medical_data_kpis',
  };

  for (const [pattern, replacement] of Object.entries(tableCorrections)) {
    const regex = new RegExp(pattern, 'gi');
    const match = sqlCorrected.match(regex);
    if (match && validTables.has(replacement)) {
      const originalSql = sqlCorrected;
      sqlCorrected = sqlCorrected.replace(regex, replacement);
      if (sqlCorrected !== originalSql) {
        correctionsMade.push(`${match[0]} -> ${replacement}`);
      }
    }
  }

  return { correctedSql: sqlCorrected, correctionsMade };
}

/**
 * Extract table names used in SQL query.
 */
export function extractTablesFromSql(
  sql: string,
  validTables: Set<string>,
): Set<string> {
  const tablesInSql = new Set<string>();
  const words = sql.split(/\s+/);
  const lowerValidTables = new Set(
    [...validTables].map((t) => t.toLowerCase()),
  );

  for (const word of words) {
    const wordClean = word.replace(/[(),;]/g, '').toLowerCase();
    if (lowerValidTables.has(wordClean)) {
      // Find the original casing
      const original = [...validTables].find(
        (t) => t.toLowerCase() === wordClean,
      );
      if (original) tablesInSql.add(original);
    }
  }
  return tablesInSql;
}

/**
 * Add a thought to state for UI transparency.
 */
export function addThought(
  state: GraphState | Partial<GraphState>,
  message: string,
): void {
  if (!state.thoughts) {
    state.thoughts = [];
  }
  state.thoughts.push(message);
  logger.log(`💭 ${message}`);
}

export type SqlOperationType = 'READ_ONLY' | 'WRITE' | 'DDL' | 'UNKNOWN';

export interface SqlComplexityReport {
  sqlLength: number;
  joinCount: number;
  hasUnion: boolean;
  hasLimit: boolean;
  hasGroupBy: boolean;
}

function normalizeSqlForPolicy(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim();
}

export function classifySqlOperation(sql: string): SqlOperationType {
  const normalized = normalizeSqlForPolicy(sql);
  const upper = normalized.toUpperCase();

  if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
    return 'READ_ONLY';
  }

  if (/^(INSERT|UPDATE|DELETE|REPLACE|MERGE)\b/.test(upper)) {
    return 'WRITE';
  }

  if (/^(CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|REVOKE)\b/.test(upper)) {
    return 'DDL';
  }

  return 'UNKNOWN';
}

export function enforceReadOnlySql(sql: string): {
  allowed: boolean;
  reason?: string;
} {
  const operation = classifySqlOperation(sql);
  if (operation === 'READ_ONLY') {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      operation === 'UNKNOWN'
        ? 'Unable to classify SQL operation safely'
        : `Blocked ${operation} SQL operation`,
  };
}

export function analyzeSqlComplexity(sql: string): SqlComplexityReport {
  const normalized = normalizeSqlForPolicy(sql).toUpperCase();
  const joinCount = (normalized.match(/\bJOIN\b/g) || []).length;

  return {
    sqlLength: normalized.length,
    joinCount,
    hasUnion: /\bUNION\b/.test(normalized),
    hasLimit: /\bLIMIT\b\s+\d+/.test(normalized),
    hasGroupBy: /\bGROUP\s+BY\b/.test(normalized),
  };
}

export function enforceSqlComplexity(sql: string): {
  allowed: boolean;
  issues: string[];
} {
  const report = analyzeSqlComplexity(sql);
  const issues: string[] = [];

  if (report.sqlLength > 12000) {
    issues.push('Query length exceeds complexity limit');
  }

  if (report.joinCount > 8) {
    issues.push('Join depth exceeds maximum allowed threshold (8)');
  }

  if (report.hasUnion && report.joinCount > 4) {
    issues.push('UNION with high join depth is blocked for stability');
  }

  if (!report.hasLimit && !report.hasGroupBy && report.joinCount >= 4) {
    issues.push('High-join query must include LIMIT to bound result size');
  }

  return {
    allowed: issues.length === 0,
    issues,
  };
}
