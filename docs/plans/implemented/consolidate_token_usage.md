---
title: "Consolidate Multi-Provider Token Usage Dashboard"
status: completed
priority: high
estimated_hours: 4-6
dependencies: []
created: 2026-02-09
started: 2026-02-09
completed: 2026-02-10
related_files:
  - backend/services/token_tracker.py
  - backend/routers/token_usage.py
  - backend/app/utils/token_tracking.py
  - backend/domain/models.py
  - frontend/src/pages/UsageDashboard.tsx
  - frontend/src/services/tokenUsageService.ts
  - frontend/src/components/Usage/UsageIndicator.tsx
---

## Goal

Pool all provider token usage into a single unified view. The monthly quota (default 1M tokens) applies globally across **all** providers. Add an optional per-provider breakdown toggle so users can see token distribution between Bedrock, OpenAI, etc.

## Problem Statement

Currently, the token tracking system is fragmented per provider:

1. **Quota check is per-provider** — `check_monthly_limit()` filters by `TokenUsage.provider == provider.value`, so 500k bedrock + 500k openai = only 500k visible to each check. Users can exceed the intended 1M limit by using multiple providers.
2. **Usage History shows duplicate bars** — `GET /monthly` groups by `(month, provider)`, producing 2+ bars per month when multiple providers are used. Each bar appears to show low usage against the full limit.
3. **Status endpoints are hardcoded to Bedrock** — `GET /status`, `GET /`, and `GET /admin/users` all hardcode `Provider.BEDROCK`, ignoring usage from OpenAI, Gemini, Anthropic, and Local.
4. **Agent quota checks default to "bedrock"** — The `check_quota()` utility in `token_tracking.py` defaults to `provider="bedrock"`, so pre-call quota enforcement may not see cross-provider usage.

## Database Assessment

**No schema changes needed.** The `token_usage` table already stores per-row `provider` and `model` columns, which is correct for granular logging. The issue is purely in the **query/aggregation layer** — we need to remove provider filters from global queries and add new per-provider breakdown queries.

The `User.monthly_token_limit` (Integer, default 1,000,000) is already a single global limit — not per-provider — so the data model is already correct.

## Implementation Steps

### Phase 1: Backend — Global Quota Enforcement

- [x] **1.1 Make `check_monthly_limit()` provider-agnostic**
  - File: `backend/services/token_tracker.py` (~line 158-164)
  - Remove `TokenUsage.provider == provider.value` filter from the sum query
  - Remove `provider` parameter (or make it optional for breakdown only)
  - Sum ALL tokens for the user in the current month, regardless of provider

- [x] **1.2 Update `get_usage_status()` to be global**
  - File: `backend/services/token_tracker.py` (~line 178)
  - Remove `provider` parameter dependency
  - Call updated `check_monthly_limit()` without provider filter

- [x] **1.3 Fix `check_quota()` utility**
  - File: `backend/app/utils/token_tracking.py` (~line 112-114)
  - Remove `provider` parameter and `"bedrock"` default
  - All agents' pre-call checks now enforce the global quota
  - Update callers in `router.py`, `schema_navigator.py`, `sql_writer.py`, `critic.py`

### Phase 2: Backend — Fix API Endpoints

- [x] **2.1 Fix `GET /api/v1/token-usage` endpoint**
  - File: `backend/routers/token_usage.py` (~line 278-305)
  - Remove hardcoded `Provider.BEDROCK` filter
  - Sum across all providers for the authenticated user

- [x] **2.2 Fix `GET /api/v1/token-usage/status` endpoint**
  - File: `backend/routers/token_usage.py` (~line 399-433)
  - Remove hardcoded `Provider.BEDROCK`
  - Return global usage (all providers pooled)

- [x] **2.3 Fix `GET /api/v1/token-usage/monthly` endpoint**
  - File: `backend/routers/token_usage.py` (~line 309-395)
  - Change SQL `GROUP BY (month, provider)` → `GROUP BY (month)` only
  - Each month returns ONE aggregated row with total tokens across all providers
  - Add `total_cost_usd` as sum of all providers' costs

- [x] **2.4 Add `GET /api/v1/token-usage/monthly/breakdown` endpoint** (NEW)
  - Returns per-provider-per-month data for the breakdown view
  - Keep existing `GROUP BY (month, provider)` query here
  - Response: `{ usage: [{ month, provider, total_tokens, total_cost_usd, request_count }] }`

- [x] **2.5 Fix `GET /api/v1/token-usage/admin/users` endpoint**
  - File: `backend/routers/token_usage.py` (~line 498+)
  - Remove hardcoded `Provider.BEDROCK`
  - Sum across all providers per user

### Phase 3: Frontend — Consolidated Dashboard

- [x] **3.1 Update `UsageDashboard.tsx` — Current Month Usage**
  - Verified: Calls `tokenUsageService.getUsageStatus()` for global usage
  - Displays single consolidated view across all providers

- [x] **3.2 Update `UsageDashboard.tsx` — Usage History**
  - Verified: Calls `tokenUsageService.getMonthlyBreakdown()` for consolidated data
  - Monthly bars show ONE bar per month (total tokens across all providers)
  - Each bar compares total tokens vs. the global limit

- [x] **3.3 Add Provider Breakdown toggle to Token Usage Dashboard**
  - Added "Show by Provider" toggle button
  - When toggled, displays per-provider breakdown data
  - Color-coded by provider: Bedrock=blue, OpenAI=green, Gemini=purple, Anthropic=orange, Local=gray
  - Shows per-provider: token count, cost, request count

- [x] **3.4 Add breakdown to `tokenUsageService.ts`**
  - Added `getProviderBreakdown()` method
  - Calls `GET /api/v1/token-usage/monthly/breakdown`
  - Parses and transforms the breakdown response for UI

- [x] **3.5 Refactor API schemas into modular structure**
  - Split `api/v1/schemas.py` into domain-specific modules:
    - `auth.py` - Token, User, UserCreate
    - `query.py` - QueryRequest, QueryResponse, StreamEvent
    - `thread.py` - ThreadCreate, ThreadResponse, MessageResponse
    - `health.py` - HealthResponse, ModelInfo
    - `token_usage.py` - Token usage schemas (already existed)
  - Update `__init__.py` to re-export all schemas for backward compatibility
  - Update `routers/token_usage.py` to import from main schemas package
  - Update ARCHITECTURE.md with new schema organization

- [x] **3.6 Update `UsageIndicator.tsx` (sidebar widget)**
  - Verified: Calls `tokenUsageService.getUsageStatus()` for global usage
  - Works correctly with consolidated global data from `/status`
  - No additional changes needed

### Phase 4: Verification & Bug Fixes

- [x] **4.1 Fix sql_generator.py check_quota calls**
  - Fixed line 68 in `plan_query()` - removed provider parameter
  - Fixed line 154 in `generate_sql()` - removed provider parameter
  - Fixed line 258 in `reflect_on_error()` - removed provider parameter
  - All check_quota() calls now use 2-param signature (tracker, user_id)
  - Resolves runtime error: "check_quota() takes 2 positional arguments but 3 were given"

- [x] **4.2 Verify all check_quota() calls updated**
  - Grep search confirms NO 3-parameter check_quota calls remain
  - Import test confirms sql_generator.py compiles without errors

- [x] **4.3 Test consolidated quota enforcement**
  - Runtime testing confirmed quota enforcement works globally
  - Bug fix verified: sql_generator.py now checks global quota correctly
  - All check_quota() calls use consolidated 2-param API

- [x] **4.4 Test dashboard displays**
  - Verified: Single bar per month in usage history (consolidated view)
  - Verified: Provider breakdown toggle displays per-provider distribution
  - Verified: Admin panel endpoint returns global usage per user
  - All UI components call correct global endpoints

- [x] **4.5 Update plan status and docs/README.md**
  - All phases complete (Phase 1-4)
  - Ready to move plan to implemented/

## API Response Shapes (After Changes)

### `GET /api/v1/token-usage/status` (global)
```json
{
  "user_id": "uuid",
  "month": "2026-02",
  "can_proceed": true,
  "tokens_used": 225334,
  "tokens_limit": 1000000,
  "tokens_remaining": 774666,
  "usage_percentage": 22.5,
  "warning_level": "normal",
  "thresholds": { "normal": 0, "medium": 80, "high": 90, "critical": 95 }
}
```

### `GET /api/v1/token-usage/monthly` (consolidated)
```json
{
  "user_id": "uuid",
  "usage": [
    {
      "month": "2026-02",
      "total_input_tokens": 150000,
      "total_output_tokens": 75334,
      "total_tokens": 225334,
      "total_cost_usd": 3.45,
      "request_count": 42
    }
  ]
}
```

### `GET /api/v1/token-usage/monthly/breakdown` (NEW — per-provider)
```json
{
  "user_id": "uuid",
  "usage": [
    {
      "month": "2026-02",
      "provider": "bedrock",
      "total_tokens": 180000,
      "total_cost_usd": 2.80,
      "request_count": 35
    },
    {
      "month": "2026-02",
      "provider": "openai",
      "total_tokens": 45334,
      "total_cost_usd": 0.65,
      "request_count": 7
    }
  ]
}
```

## Files to Modify

| File | Change |
|------|--------|
| `backend/services/token_tracker.py` | ✅ Remove provider filter from `check_monthly_limit()`, `get_usage_status()` |
| `backend/app/utils/token_tracking.py` | ✅ Remove provider param from `check_quota()` |
| `backend/app/agents/router.py` | ✅ Update `check_quota()` call |
| `backend/app/agents/schema_navigator.py` | ✅ Update `check_quota()` call |
| `backend/app/agents/sql_writer.py` | ✅ Update `check_quota()` call |
| `backend/app/agents/critic.py` | ✅ Update `check_quota()` call |
| `backend/routers/token_usage.py` | ✅ Fix all endpoints, add breakdown endpoint, refactor schema imports |
| `backend/api/v1/schemas/__init__.py` | ✅ Re-export all schemas from submodules |
| `backend/api/v1/schemas/auth.py` | ✅ NEW: Auth schemas (Token, User, UserCreate) |
| `backend/api/v1/schemas/query.py` | ✅ NEW: Query schemas (QueryRequest, QueryResponse, StreamEvent) |
| `backend/api/v1/schemas/thread.py` | ✅ NEW: Thread schemas (ThreadCreate, ThreadResponse) |
| `backend/api/v1/schemas/health.py` | ✅ NEW: Health schemas (HealthResponse, ModelInfo) |
| `backend/api/v1/schemas/token_usage.py` | ✅ Token usage schemas |
| `frontend/src/pages/UsageDashboard.tsx` | ✅ Add provider breakdown toggle |
| `frontend/src/services/tokenUsageService.ts` | ✅ Add `getProviderBreakdown()`, update types |
| `frontend/src/components/Usage/UsageIndicator.tsx` | Verify works with global data |
| `docs/context/ARCHITECTURE.md` | ✅ Update with new schema structure |
