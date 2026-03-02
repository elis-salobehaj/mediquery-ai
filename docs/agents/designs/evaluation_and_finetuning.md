# Evaluation and Prompt Tuning Design

## Purpose

Improve Text-to-SQL quality through benchmark-driven iteration.

## Loop

1. extend/adjust benchmark cases
2. run benchmarks
3. inspect failure classes
4. tune prompts/logic
5. re-run and compare

## Quality Targets

- schema selection precision
- concept join compliance
- semantic correctness for aggregation/time filters
- provider robustness
