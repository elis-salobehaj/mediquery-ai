import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Pool, PoolClient } from 'pg';
import { policyGateNode } from '@/ai/policy-gate';
import { createInitialState } from '@/ai/state';
import { config } from '@/config/env.config';

type PolicyExpectation = 'ALLOW' | 'BLOCK';
type BenchmarkExecutionMode = 'mode-a' | 'mode-b';

// ---------------------------------------------------------------------------
// Policy gate regression cases (deterministic — no LLM required)
// All queries reference OMOP CDM v5.4 terminology.
// ---------------------------------------------------------------------------
interface PolicyCase {
  id: string;
  query: string;
  expectedPolicyGate: PolicyExpectation;
  sql?: string;
  expectedSqlPolicy?: PolicyExpectation;
}

// ---------------------------------------------------------------------------
// Golden query corpus (loaded from omop_golden_queries.jsonl)
// ---------------------------------------------------------------------------
interface GoldenQuery {
  id: string;
  category: string;
  tier: 'easy' | 'medium' | 'hard';
  question: string;
  expected_outcome: string;
  golden_sql: string;
  expected_tables: string[];
  expected_joins?: string[];
  validation_hints: string;
}

interface GoldenQueryResult {
  id: string;
  category: string;
  tier: string;
  question: string;
  tableSelectionAccurate: boolean;
  conceptJoinDetected: boolean;
  expectedTablesPresent: string[];
  expectedTablesMissing: string[];
  hasConceptJoin: boolean;
  needsConceptJoin: boolean;
  sqlExecutionPassed?: boolean;
  sqlExecutionError?: string;
}

// ---------------------------------------------------------------------------
// Benchmark summary
// ---------------------------------------------------------------------------
interface BenchmarkCaseResult {
  id: string;
  policyGatePassed: boolean;
  expectedPolicyGate: PolicyExpectation;
  sqlPolicyPassed?: boolean;
  expectedSqlPolicy?: PolicyExpectation;
  issues: string[];
}

interface CategoryAccuracy {
  total: number;
  tableSelectionCorrect: number;
  conceptJoinCorrect: number;
  sqlExecutionCorrect: number;
  tableSelectionAccuracy: number;
  conceptJoinAccuracy: number;
  sqlExecutionAccuracy: number;
}

interface BenchmarkSummary {
  generated_at: string;
  mode: 'development';
  execution_mode: BenchmarkExecutionMode;
  totals: {
    cases: number;
    policy_gate_correct: number;
    sql_policy_correct: number;
    sql_policy_cases: number;
    golden_queries: number;
    table_selection_correct: number;
    concept_join_correct: number;
    sql_execution_correct: number;
    sql_execution_cases: number;
  };
  accuracy: {
    policy_gate: number;
    sql_policy: number;
    table_selection: number;
    concept_join: number;
    sql_execution: number;
  };
  by_category: Record<string, CategoryAccuracy>;
  cases: BenchmarkCaseResult[];
  golden_results: GoldenQueryResult[];
}

interface BenchmarkOptions {
  mode?: BenchmarkExecutionMode;
  dbSchema?: string;
}

// ---------------------------------------------------------------------------
// SQL policy helpers (local — no DB required)
// ---------------------------------------------------------------------------
function enforceReadOnlySqlLocal(sql: string): {
  allowed: boolean;
  reason?: string;
} {
  const normalized = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim()
    .toUpperCase();

  if (normalized.startsWith('SELECT') || normalized.startsWith('WITH')) {
    return { allowed: true };
  }

  if (/^(INSERT|UPDATE|DELETE|REPLACE|MERGE)\b/.test(normalized)) {
    return { allowed: false, reason: 'Blocked WRITE SQL operation' };
  }

  if (/^(CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|REVOKE)\b/.test(normalized)) {
    return { allowed: false, reason: 'Blocked DDL SQL operation' };
  }

  return {
    allowed: false,
    reason: 'Unable to classify SQL operation safely',
  };
}

function enforceSqlComplexityLocal(sql: string): {
  allowed: boolean;
  issues: string[];
} {
  const normalized = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim()
    .toUpperCase();

  const issues: string[] = [];
  const joinCount = (normalized.match(/\bJOIN\b/g) || []).length;
  const hasUnion = /\bUNION\b/.test(normalized);
  const hasLimit = /\bLIMIT\b\s+\d+/.test(normalized);
  const hasGroupBy = /\bGROUP\s+BY\b/.test(normalized);

  if (normalized.length > 12000) {
    issues.push('Query length exceeds complexity limit');
  }

  if (joinCount > 8) {
    issues.push('Join depth exceeds maximum allowed threshold (8)');
  }

  if (hasUnion && joinCount > 4) {
    issues.push('UNION with high join depth is blocked for stability');
  }

  if (!hasLimit && !hasGroupBy && joinCount >= 4) {
    issues.push('High-join query must include LIMIT to bound result size');
  }

  return {
    allowed: issues.length === 0,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Policy gate regression cases — OMOP-aligned
// ---------------------------------------------------------------------------
export const devCases: PolicyCase[] = [
  {
    id: 'omop_top_conditions_allow',
    query: 'show top 5 most common diagnoses from condition_occurrence',
    expectedPolicyGate: 'ALLOW',
    sql: 'SELECT c.concept_name, COUNT(*) AS freq FROM condition_occurrence co JOIN omop_vocab.concept c ON co.condition_concept_id = c.concept_id GROUP BY c.concept_name ORDER BY freq DESC LIMIT 5',
    expectedSqlPolicy: 'ALLOW',
  },
  {
    id: 'write_intent_delete',
    query: 'delete all records from condition_occurrence',
    expectedPolicyGate: 'BLOCK',
    sql: 'DELETE FROM condition_occurrence WHERE 1=1',
    expectedSqlPolicy: 'BLOCK',
  },
  {
    id: 'domain_knowledge_schema',
    query: 'what columns exist in the person table?',
    expectedPolicyGate: 'ALLOW',
  },
  {
    id: 'unsupported_ml_request',
    query: 'train a model to predict future diagnoses automatically',
    expectedPolicyGate: 'BLOCK',
  },
  {
    id: 'complex_join_without_limit',
    query: 'analyze all visits joined across every omop table without limits',
    expectedPolicyGate: 'ALLOW',
    sql: `
      SELECT *
      FROM visit_occurrence a
      JOIN condition_occurrence b ON a.person_id = b.person_id
      JOIN drug_exposure c ON b.person_id = c.person_id
      JOIN measurement d ON c.person_id = d.person_id
      JOIN procedure_occurrence e ON d.person_id = e.person_id
    `,
    expectedSqlPolicy: 'BLOCK',
  },
];

// ---------------------------------------------------------------------------
// Golden corpus loader
// ---------------------------------------------------------------------------
async function loadGoldenCorpus(corpusPath: string): Promise<GoldenQuery[]> {
  const queries: GoldenQuery[] = [];
  const rl = createInterface({
    input: createReadStream(corpusPath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) {
      queries.push(JSON.parse(trimmed) as GoldenQuery);
    }
  }
  return queries;
}

// ---------------------------------------------------------------------------
// Golden query accuracy metrics (static analysis — no LLM required)
// ---------------------------------------------------------------------------

/**
 * Table Selection Accuracy: verifies each expected OMOP table mentioned in
 * expected_tables actually appears as a table reference in golden_sql.
 */
function evaluateTableSelection(query: GoldenQuery): {
  accurate: boolean;
  present: string[];
  missing: string[];
} {
  const sqlLower = query.golden_sql.toLowerCase();
  const present: string[] = [];
  const missing: string[] = [];

  for (const table of query.expected_tables) {
    // concept can appear as omop_vocab.concept
    const tablePattern = table === 'concept' ? 'concept' : table;
    if (sqlLower.includes(tablePattern.toLowerCase())) {
      present.push(table);
    } else {
      missing.push(table);
    }
  }

  return { accurate: missing.length === 0, present, missing };
}

/**
 * Concept Join Detection: checks whether the SQL includes a join to
 * omop_vocab.concept when the query semantically requires one
 * (i.e. when concept is in expected_tables).
 */
function evaluateConceptJoin(query: GoldenQuery): {
  detected: boolean;
  needed: boolean;
} {
  const needed = query.expected_tables.includes('concept');
  const detected = query.golden_sql
    .toLowerCase()
    .includes('omop_vocab.concept');
  return { detected, needed };
}

function evaluateGoldenQuery(query: GoldenQuery): GoldenQueryResult {
  const tableResult = evaluateTableSelection(query);
  const conceptResult = evaluateConceptJoin(query);

  return {
    id: query.id,
    category: query.category,
    tier: query.tier,
    question: query.question,
    tableSelectionAccurate: tableResult.accurate,
    conceptJoinDetected: conceptResult.needed ? conceptResult.detected : true,
    expectedTablesPresent: tableResult.present,
    expectedTablesMissing: tableResult.missing,
    hasConceptJoin: conceptResult.detected,
    needsConceptJoin: conceptResult.needed,
  };
}

function createBenchmarkPool(): Pool {
  return new Pool({
    host: config.BENCHMARK_POSTGRES_HOST || config.POSTGRES_HOST,
    port: config.BENCHMARK_POSTGRES_PORT || config.POSTGRES_PORT,
    user: config.BENCHMARK_POSTGRES_USER || config.POSTGRES_USER,
    password: config.BENCHMARK_POSTGRES_PASSWORD || config.POSTGRES_PASSWORD,
    database: config.BENCHMARK_POSTGRES_DB || config.POSTGRES_DB,
    connectionTimeoutMillis: config.BENCHMARK_DB_CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: config.BENCHMARK_DB_IDLE_TIMEOUT_MS,
    query_timeout: config.BENCHMARK_DB_QUERY_TIMEOUT_MS,
  });
}

async function executeSqlValidation(
  pool: Pool,
  sqlText: string,
  dbSchema: string,
): Promise<{ passed: boolean; error?: string }> {
  const sqlClean = sqlText.trim().replace(/;$/, '');
  const searchPath = `${dbSchema},omop_vocab,public`;
  let client: PoolClient;

  try {
    client = await pool.connect();
  } catch (error: unknown) {
    return {
      passed: false,
      error: `DB connection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path TO ${searchPath}`);
    await client.query(`EXPLAIN ${sqlClean}`);
    await client.query('ROLLBACK');
    return { passed: true };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    return {
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Policy gate evaluation
// ---------------------------------------------------------------------------
async function evaluateCase(input: PolicyCase): Promise<BenchmarkCaseResult> {
  const state = createInitialState(input.query);
  state.routing_decision = 'DATA';

  const gateResult = await policyGateNode(state);
  const blockedByGate =
    gateResult.validation_result?.error === 'UNSUPPORTED_INTENT';
  const policyGateActual: PolicyExpectation = blockedByGate ? 'BLOCK' : 'ALLOW';

  let sqlPolicyPassed: boolean | undefined;
  const issues: string[] = [];

  if (input.sql && input.expectedSqlPolicy) {
    const readOnly = enforceReadOnlySqlLocal(input.sql);
    const complexity = enforceSqlComplexityLocal(input.sql);
    const sqlAllowed = readOnly.allowed && complexity.allowed;
    const sqlPolicyActual: PolicyExpectation = sqlAllowed ? 'ALLOW' : 'BLOCK';
    sqlPolicyPassed = sqlPolicyActual === input.expectedSqlPolicy;

    if (!readOnly.allowed && readOnly.reason) {
      issues.push(readOnly.reason);
    }
    if (!complexity.allowed) {
      issues.push(...complexity.issues);
    }
  }

  return {
    id: input.id,
    policyGatePassed: policyGateActual === input.expectedPolicyGate,
    expectedPolicyGate: input.expectedPolicyGate,
    sqlPolicyPassed,
    expectedSqlPolicy: input.expectedSqlPolicy,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Main evaluation function
// ---------------------------------------------------------------------------
export async function evaluateBenchmarkCases(
  cases: PolicyCase[] = devCases,
  options: BenchmarkOptions = {},
): Promise<BenchmarkSummary> {
  const executionMode: BenchmarkExecutionMode = options.mode || 'mode-a';
  const dbSchema = options.dbSchema || config.BENCHMARK_DB_SCHEMA;

  const corpusPath = resolve(__dirname, 'corpus/omop_golden_queries.jsonl');

  // Run policy gate cases
  const policyResults = await Promise.all(
    cases.map((testCase) => evaluateCase(testCase)),
  );

  // Run golden corpus static analysis
  let goldenResults: GoldenQueryResult[] = [];
  let sqlExecutionCases = 0;
  let sqlExecutionCorrect = 0;
  const pool = executionMode === 'mode-b' ? createBenchmarkPool() : null;
  try {
    const goldenQueries = await loadGoldenCorpus(corpusPath);
    goldenResults = await Promise.all(
      goldenQueries.map(async (q) => {
        const base = evaluateGoldenQuery(q);
        if (!pool) {
          return base;
        }

        sqlExecutionCases++;
        const execution = await executeSqlValidation(
          pool,
          q.golden_sql,
          dbSchema,
        );
        if (execution.passed) {
          sqlExecutionCorrect++;
        }

        return {
          ...base,
          sqlExecutionPassed: execution.passed,
          sqlExecutionError: execution.error,
        };
      }),
    );
  } catch {
    // corpus not yet present — skip golden metrics
  } finally {
    if (pool) {
      await pool.end();
    }
  }

  const policyGateCorrect = policyResults.filter(
    (r) => r.policyGatePassed,
  ).length;
  const sqlPolicyCases = policyResults.filter(
    (r) => typeof r.sqlPolicyPassed === 'boolean',
  ).length;
  const sqlPolicyCorrect = policyResults.filter(
    (r) => r.sqlPolicyPassed,
  ).length;

  const tableSelectionCorrect = goldenResults.filter(
    (r) => r.tableSelectionAccurate,
  ).length;
  const conceptJoinCorrect = goldenResults.filter(
    (r) => r.conceptJoinDetected,
  ).length;

  // Per-category breakdown
  const byCategory: Record<string, CategoryAccuracy> = {};
  for (const r of goldenResults) {
    if (!byCategory[r.category]) {
      byCategory[r.category] = {
        total: 0,
        tableSelectionCorrect: 0,
        conceptJoinCorrect: 0,
        sqlExecutionCorrect: 0,
        tableSelectionAccuracy: 0,
        conceptJoinAccuracy: 0,
        sqlExecutionAccuracy: 0,
      };
    }
    const cat = byCategory[r.category];
    cat.total++;
    if (r.tableSelectionAccurate) cat.tableSelectionCorrect++;
    if (r.conceptJoinDetected) cat.conceptJoinCorrect++;
    if (r.sqlExecutionPassed) cat.sqlExecutionCorrect++;
    cat.tableSelectionAccuracy = cat.tableSelectionCorrect / cat.total;
    cat.conceptJoinAccuracy = cat.conceptJoinCorrect / cat.total;
    cat.sqlExecutionAccuracy =
      executionMode === 'mode-b' ? cat.sqlExecutionCorrect / cat.total : 0;
  }

  const summary: BenchmarkSummary = {
    generated_at: new Date().toISOString(),
    mode: 'development',
    execution_mode: executionMode,
    totals: {
      cases: policyResults.length,
      policy_gate_correct: policyGateCorrect,
      sql_policy_correct: sqlPolicyCorrect,
      sql_policy_cases: sqlPolicyCases,
      golden_queries: goldenResults.length,
      table_selection_correct: tableSelectionCorrect,
      concept_join_correct: conceptJoinCorrect,
      sql_execution_correct: sqlExecutionCorrect,
      sql_execution_cases: sqlExecutionCases,
    },
    accuracy: {
      policy_gate:
        policyResults.length === 0
          ? 0
          : policyGateCorrect / policyResults.length,
      sql_policy: sqlPolicyCases === 0 ? 0 : sqlPolicyCorrect / sqlPolicyCases,
      table_selection:
        goldenResults.length === 0
          ? 0
          : tableSelectionCorrect / goldenResults.length,
      concept_join:
        goldenResults.length === 0
          ? 0
          : conceptJoinCorrect / goldenResults.length,
      sql_execution:
        sqlExecutionCases === 0 ? 0 : sqlExecutionCorrect / sqlExecutionCases,
    },
    by_category: byCategory,
    cases: policyResults,
    golden_results: goldenResults,
  };

  return summary;
}

async function main() {
  const cliArgs = process.argv.slice(2);
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const modeValue = modeArg?.split('=')[1]?.toLowerCase();
  const positionalArgs = cliArgs.filter((arg) => !arg.startsWith('--'));
  const configuredMode = config.BENCHMARK_MODE.toLowerCase();
  const executionMode: BenchmarkExecutionMode =
    modeValue === 'live' || modeValue === 'mode-b'
      ? 'mode-b'
      : configuredMode === 'live' || configuredMode === 'mode-b'
        ? 'mode-b'
        : 'mode-a';

  const outputPath =
    positionalArgs[0] ||
    resolve(process.cwd(), '../docs/reports/guardrail_benchmark_dev.json');

  const summary = await evaluateBenchmarkCases(devCases, {
    mode: executionMode,
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const policyPct = (summary.accuracy.policy_gate * 100).toFixed(1);
  const sqlPct = (summary.accuracy.sql_policy * 100).toFixed(1);
  const tableSelPct = (summary.accuracy.table_selection * 100).toFixed(1);
  const conceptPct = (summary.accuracy.concept_join * 100).toFixed(1);
  const executionPct = (summary.accuracy.sql_execution * 100).toFixed(1);
  console.log(
    `Dev benchmark complete:`,
    `mode=${summary.execution_mode}`,
    `policy_gate=${policyPct}%`,
    `sql_policy=${sqlPct}%`,
    `table_selection=${tableSelPct}%`,
    `concept_join=${conceptPct}%`,
    `sql_execution=${executionPct}%`,
    `golden_queries=${summary.totals.golden_queries}`,
    `-> ${outputPath}`,
  );
}

if (process.argv[1]?.includes('dev-benchmark')) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
