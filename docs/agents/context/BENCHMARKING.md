# Benchmarking Context (Current)

## Purpose

Benchmarking validates OMOP query quality and guardrail behavior in the NestJS backend.

## Components

1. Harness: `backend/src/ai/benchmarks/dev-benchmark.ts`
2. Corpus: `backend/src/ai/benchmarks/corpus/omop_golden_queries.jsonl`
3. Unit test: `backend/test/ai/dev-benchmark.spec.ts`
4. Report: `docs/reports/guardrail_benchmark_dev.json`

## Corpus Contract

Each JSONL row must include:

- `id`
- `category`
- `tier`
- `question`
- `expected_outcome`
- `golden_sql`
- `expected_tables`
- `expected_joins`
- `validation_hints`

All entries must target OMOP v5.4 entities.

## Metrics

- policy gate accuracy
- SQL policy accuracy
- table selection accuracy
- concept join accuracy
- SQL execution accuracy (Mode B)
- per-category accuracy

## Modes

Mode A:

`cd backend && pnpm benchmark:dev`

Mode B:

`cd backend && pnpm exec tsx src/ai/benchmarks/dev-benchmark.ts --mode=live`

Mode B uses benchmark DB config from Zod-backed config.
