# Evolution Roadmap (Agent)

## Near-Term Priorities

1. Expand OMOP golden corpus depth by category/tier.
2. Tighten retrieval quality for concept-heavy questions.
3. Improve benchmark diagnostics for failure classification.

## Mid-Term Priorities

1. CI-integrated benchmark gates by category thresholds.
2. Provider comparison matrix for quality/latency trade-offs.
3. Hardening of tenant-schema routing checks in runtime and benchmark modes.

## Long-Term Priorities

1. Optional self-hosted model training path after governance gates pass.
2. Historical quality scorecards and regression trend tracking.

## Training Gate Conditions

Self-hosted training remains deferred until all are true:
- mature benchmark coverage,
- stable evaluation harness,
- approved security/compliance controls,
- no-PHI guarantees in training/evaluation artifacts.
