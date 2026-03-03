# Active Plans

**Current Active Plans**: 2

**Last Updated**: 2026-03-03

## 🚀 In Progress

| #   | Plan                                                         | Status       | Est. Hours |
| --- | ------------------------------------------------------------ | ------------ | ---------- |
| 1   | **Automated Benchmarking & Evaluation Pipeline** ([plan](automated_benchmarking_evaluation_pipeline.md)) | 🔄 Phase 1A/5 (corpus + dev baseline done) | 20-35h     |
| 2   | **OMOP Vocabulary Automation (Open-License, No Manual Steps)** ([plan](omop_vocabulary_automation_open_data.md)) | 🔄 Phase 5/6 (CI runbook pending) | 5-8h     |

## ✅ Recently Completed

- ✅ **[OMOP Golden Dataset Hardening](../implemented/omop_golden_dataset_hardening.md)** — all 8 phases complete, 162 tests passing, 10/10 curl battery (2026-03-03)
- ✅ **[OMOP & Synthea Migration](../implemented/omop_synthea_migration.md)** — completed and moved to implemented
- ✅ **[Shadcn v4 UI Overhaul](../implemented/shadcn_v4_ui_overhaul.md)** — completed and moved to implemented (2026-02-27)
- ✅ **[LLM Routing & Agentic Optimization](../implemented/llm_routing_agentic_optimization.md)** — completed and moved to implemented (2026-02-27)
- ✅ **[LangGraph Workflow Refactor](../implemented/langgraph_workflow_refactor.md)** — implemented partially as architecture evolved (moved from backlog)
- ✅ **[Multi-Agent Reflexion](../implemented/multi-agent-reflexion.md)** — already implemented; retained as historical design context
- ✅ **[Token Consumption Tracking - Phase 2](../implemented/token_tracking_phase2.md)** — already implemented; superseded by current TS implementation

---

When starting new work:

1. Create a plan file in this directory
2. Use the frontmatter template from [`../README.md`](../README.md)
3. Update `docs/README.md` to list the new active plan
4. Link related files in the frontmatter

## Plan Lifecycle

```
backlog/ → active/ → implemented/
   ↓         ↓            ↓
  idea → in progress → complete
```

When a plan here is 100% complete:

1. Move it to `implemented/`
2. Update frontmatter: `status: implemented`, add `date_completed`
3. Update `docs/README.md` to reflect completion
