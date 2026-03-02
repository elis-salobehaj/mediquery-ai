# Multi-Agent Architecture Design

## Objective

Generate safe and accurate OMOP SQL with specialized nodes.

## Nodes

1. Router
2. Policy Gate
3. Schema Navigator
4. SQL Writer
5. Critic
6. Reflector

## Rules

- Agent node files belong under `backend/src/ai/agents/` and use `*-agent.ts`.
- Clinical label output requires `omop_vocab.concept` joins.
- Failure path must preserve explainable diagnostics.
