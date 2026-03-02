---
title: "OpenAI LLM Provider Integration"
status: implemented
priority: high
estimated_hours: 4-6
dependencies: []
created: 2026-02-06
started: 2026-02-06
date_completed: 2026-02-09
---

## Goal

Integrate OpenAI as a fifth LLM provider. Users select an OpenAI model (e.g. `gpt-5.2-codex`) from the frontend dropdown, and all multi-agent pipeline agents use it.

## Key Decisions

- **All agents switch** when an OpenAI model is selected (router, navigator, sql_writer, critic, meta_agent)
- **Prefix convention** for model IDs: `openai/gpt-5.2-codex`, `bedrock/global.anthropic...` — backend parses provider from prefix
- **Dynamic model list** — frontend fetches from `/config/models` instead of hardcoding
- **Provider priority**: Bedrock > OpenAI > Gemini > Anthropic > Local

## Steps

- [x] **1. Add `langchain-openai` dependency** in `backend/pyproject.toml`, run `uv sync`
- [x] **2. Add OpenAI settings** to `backend/config.py` (`use_openai`, `openai_api_key`, `openai_*_model` fields, update `active_provider` priority)
- [x] **3. Add OpenAI branch in LLM Factory** — `backend/app/core/llm_provider.py`: conditional import of `ChatOpenAI`, new provider branch in `create_llm()`, update `get_available_providers()`
- [x] **4. Add `resolve_provider_from_model_id()` utility** in `llm_provider.py` — parses `provider/model` prefix, falls back to `settings.active_provider`
- [x] **5. Thread `model_id` through multi-agent graph** — `GraphBuilder` accepts `model_override`, passes to all agent wrappers → agent nodes → `get_llm_for_role()`
- [x] **6. Pass `model_id` from API endpoints to graph** — update `create_graph()` calls in `backend/api/v1/endpoints/queries.py` (both `/query` and `/stream`)
- [x] **7. Update `/config/models` endpoint** — `LLMAgentCompat.get_available_models()` returns prefixed model IDs from all available providers
- [x] **8. Frontend: fetch models dynamically** — remove hardcoded `MODELS` array in `App.tsx`, fetch from `GET /config/models` on mount
- [x] **9. Add OpenAI to token tracking** — `Provider.OPENAI` enum, `OPENAI_PRICING` dict, cost calculation branch in `token_tracker.py`
- [x] **10. Update env files & docker-compose** — rename `OPENAI_KEY` → `OPENAI_API_KEY`, add `USE_OPENAI`, `OPENAI_*_MODEL` vars
- [x] **11. Update `LLMAgentCompat.configure()`** — add OpenAI provider detection

## Verification

1. `cd backend && uv sync` — langchain-openai installs
2. `python -c "from config import settings; print(settings.active_provider)"` → `openai` when `USE_OPENAI=true`
3. Frontend dropdown shows models from `/config/models` including OpenAI
4. Multi-agent query with OpenAI model → backend logs show `provider=openai`
5. Token tracking records `provider=openai`

## Files Changed

- `backend/pyproject.toml`
- `backend/config.py`
- `backend/app/core/llm_provider.py`
- `backend/app/graph.py`
- `backend/app/agents/{router,sql_writer,schema_navigator,critic,meta_agent}.py`
- `backend/api/v1/endpoints/queries.py`
- `backend/services/llm_agent_compat.py`
- `backend/services/token_tracker.py`
- `frontend/src/App.tsx`
- `.env`, `.env.example`, `docker-compose.yml`
