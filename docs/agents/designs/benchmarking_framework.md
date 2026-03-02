# Benchmarking Framework Design

## Goal

Provide repeatable evaluation of OMOP SQL safety and correctness.

## Inputs

- OMOP golden corpus
- deterministic policy cases
- optional live SQL execution (Mode B)

## Evaluation Axes

1. policy gate correctness
2. SQL policy correctness
3. table selection correctness
4. concept join correctness
5. live SQL execution success

## Constraints

- corpus remains OMOP-only
- concept joins use `omop_vocab.concept`
- Mode B fails safely with explicit diagnostics
