---
title: "Token Consumption Tracking - Phase 1 (Bedrock Only)"
status: implemented
priority: high
estimated_hours: 16-20
target_completion: 2026-02-07
date_created: 2026-02-01
date_updated: 2026-02-01
date_completed: 2026-02-01
current_phase: "Complete"
completion_percentage: 100
dependencies: []
---

# Token Consumption Tracking - Phase 1 (Bedrock Only)

## 📊 Progress Summary

**Phase 1 (Core Tracking)**: ✅ **COMPLETE** (65% of total plan)
- Token tracking service implemented and verified
- Agent-specific tracking working (router, navigator, sql_writer, critic, meta_agent)
- Cost calculation accurate ($0.4553 for 21,659 tokens)
- Database schema complete with agent_type column

**Phase 1.5 (Pre-emptive Enforcement)**: ✅ **COMPLETE** (25% of total plan)
- Quota checks BEFORE LLM calls implemented in ALL agents (router, navigator, sql_writer, critic)
- Quota checks in sql_generator service (all 3 methods: generate_query_plan, generate_sql, reflect_on_error)
- Streaming endpoint returns quota errors as {"type": "error", "content": "..."} events
- Successfully tested with test_v2 user (1000 token limit, 18562 tokens used)
- All 3 modes enforce quota correctly: multi-agent, fast mode, thinking mode

**Phase 2 (API Endpoints)**: ✅ **COMPLETE** (20% of total plan)
- 5 REST API endpoints implemented
- Pydantic response models
- Admin features (quota updates, view all users)

**Phase 3 (Frontend Integration)**: ✅ **COMPLETE** (10% of total plan)
- Usage indicators in UI with smart auth polling
- Visual warnings and dashboard
- Admin quota management page
- **Code Modernization**: React 2026 standards applied, DRY violations fixed

---

## 🎯 Objective

Implement real-time token consumption tracking and enforcement for AWS Bedrock LLM calls with monthly user limits.

## 📋 Requirements

1. **Track token usage** per user per calendar month (input + output tokens)
2. **Enforce monthly limits** before LLM calls (reject if exceeded)
3. **Persist data** in a scalable, performant database
4. **Bedrock-only** implementation (other providers in Phase 2)
5. **Fast delivery** - prioritize MVP over perfection

---

## 🏗️ Architecture Decision

### Database Choice: **PostgreSQL** (in Docker)

**Why PostgreSQL over SQLite:**
- ✅ **Better concurrency** - Multiple write operations (critical for token updates)
- ✅ **JSONB support** - Flexible metadata storage
- ✅ **Superior aggregation** - Fast monthly rollups with window functions
- ✅ **Production-ready** - Same DB for dev and prod
- ✅ **pgvector support** - Future semantic search (if needed)

**Why NOT separate container:**
- Single Docker network, simpler orchestration
- Easier backups, fewer moving parts
- Current scale doesn't justify microservices overhead

**AWS Equivalent:** RDS PostgreSQL Serverless v2 (auto-scaling, pay-per-second)
**GCP Equivalent:** Cloud SQL for PostgreSQL (serverless edition)

---

## 📊 Database Schema

### Phase 1 Database: `mediquery_tokens` (PostgreSQL)

**Greenfield Implementation**: All tables created fresh in PostgreSQL. No migration from SQLite.

```sql
-- 1. Users (Enhanced for Auth + RLS)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user', -- 'admin', 'user'
    is_active BOOLEAN DEFAULT TRUE,
    preferences JSONB DEFAULT '{}', -- e.g., {"theme": "dark", "default_model": "bedrock"}
    monthly_token_limit INTEGER DEFAULT 1000000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);

-- 2. Chat Threads (New concept for grouping messages)
CREATE TABLE chat_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Chat Messages (Optimized for history)
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES chat_threads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- Denormalized for fast access
    role VARCHAR(50) NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    agent_type VARCHAR(50), -- 'main', 'navigator', 'sql_writer', 'critic'
    metadata JSONB DEFAULT '{}', -- { "sql": "SELECT...", "chart_config": {...} }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_thread FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
);

CREATE INDEX idx_chat_thread ON chat_messages(thread_id, created_at);
CREATE INDEX idx_chat_user ON chat_messages(user_id, created_at DESC);

-- 4. Token Usage (Tracking)
CREATE TABLE token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    request_id UUID UNIQUE NOT NULL,
    provider VARCHAR(50) NOT NULL, -- 'bedrock', 'gemini'
    model VARCHAR(255) NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
    cost_usd DECIMAL(10, 6),
    request_metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    calendar_month VARCHAR(7) GENERATED ALWAYS AS (TO_CHAR(created_at, 'YYYY-MM')) STORED
);

CREATE INDEX idx_usage_user_month ON token_usage(user_id, calendar_month);
CREATE INDEX idx_usage_request ON token_usage(request_id);

-- 5. Monthly Usage View (Materialized for speed)
CREATE MATERIALIZED VIEW user_monthly_usage AS
SELECT 
    user_id,
    calendar_month,
    provider,
    SUM(input_tokens) as total_input_tokens,
    SUM(output_tokens) as total_output_tokens,
    SUM(total_tokens) as total_tokens,
    SUM(cost_usd) as total_cost,
    COUNT(*) as request_count,
    MAX(created_at) as last_updated
FROM token_usage
GROUP BY user_id, calendar_month, provider
WITH DATA;

CREATE UNIQUE INDEX idx_monthly_usage ON user_monthly_usage(user_id, calendar_month, provider);
```

**NoSQL Alternative (DynamoDB/Firestore):**
```
Partition Key: user_id#calendar_month
Sort Key: timestamp
GSI: request_id (for deduplication)

Pros: Infinite scale, serverless
Cons: Complex aggregations, higher cost for small scale
```

---

## 🔧 Implementation Plan

### **Step 1: PostgreSQL Setup & Schema Creation (4 hours)**

**Greenfield Implementation** - No migration needed! Creating fresh database with Alembic from scratch.

**Location**: `backend/alembic/versions/`

**Tasks:**
- [x] Add PostgreSQL container to `docker-compose.yml`
- [x] Configure multi-database support in Pydantic Settings
- [x] Create Alembic migration for ALL tables (Users, Chat, TokenUsage)
- [x] Initialize empty PostgreSQL database with Alembic
- [x] Update `auth.py` to use new `users` PG table
- [x] Update `chat.py` to use new `chat_messages` PG table

**Verifications:**
- [x] Create test user (test/test123) and login
- [x] Run query: "hello"
- [x] Run query: "show top 5 most performant patients"
- [x] Run query: "find the patient with highest duration"
- [x] Verify chat history persists after logout/login
- [x] Verify creating new chat and history retention on multiple threads
- [x] Verify UI works as expected (end-to-end)

**Files to create/modify:**
- `docker-compose.yml` - Add `postgres` service (port 5432)
- `backend/config.py` - Add `postgresql_url` property for multi-DB support
- `backend/alembic/versions/XXXXXX_create_token_tracking_schema.py` - Initial schema
- `backend/services/database.py` - Add PostgreSQL session factory

**PostgreSQL Container Config:**
```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:18.3-alpine  # Pinned to 18.1 for stability
    container_name: mediquery-postgres
    environment:
      POSTGRES_DB: mediquery_tokens
      POSTGRES_USER: mediquery
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mediquery"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

**Version Choice:**
- PostgreSQL 18.1 (Nov 2025) - Pinned for stability
- Using `-alpine` variant for smaller image size (~80MB vs ~350MB)

**Multi-Database Pydantic Config:**
```python
# backend/config.py

class Settings(BaseSettings):
    # Existing MySQL/Percona (for KPI data)
    db_host: str = "mediquery-db"
    db_port: int = 3306
    db_user: str = "mediquery"
    db_password: str = ""
    db_name: str = "mediquery"
    
    # NEW: PostgreSQL (for token tracking + future analytics)
    postgres_host: str = "mediquery-postgres"
    postgres_port: int = 5432
    postgres_user: str = "mediquery"
    postgres_password: str = ""
    postgres_db: str = "mediquery_tokens"
    
    @property
    def database_url(self) -> str:
        """MySQL URL for KPI data."""
        return f"mysql+pymysql://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"
    
    @property
    def postgresql_url(self) -> str:
        """PostgreSQL URL for token tracking."""
```

---

### **Step 1.5: Secure Logout & Frontend Integration (Backend Foundation)**

**Tasks:**
- [x] Add `TokenBlacklist` model to database
- [x] Create Alembic migration for `token_blacklist` table
- [x] Update `AuthService` to include token blacklisting logic
- [x] Implement `/auth/logout` endpoint in backend
- [x] Integrate Frontend `SettingsMenu` with Logout functionality
- [x] Refactor `backend/models.py` into `backend/domain/models.py` (Domain-driven structure)

---

### **Step 1.6: Docker & E2E Verification**

**Tasks:**
- [x] Configure `docker-compose.yml` for PostgreSQL (App Data) + MySQL (KPIs)
- [x] Configure `docker-compose.test.yml` to inherit full system context
- [x] Update `run-e2e.sh` to use multi-file Compose strategy
- [x] Fix Python dependencies (`psycopg2-binary`) for Docker builds
- [x] Verify Full Stack in Docker Mode:
  - [x] Login with `test_final` (History persisted from Dev Mode)
  - [x] Logout works securely
  - [x] Login with `test_v2` (Multi-user support)
  - [x] Multi-Agent Analytics ("Most performant patient") via MySQL

---

---

### **Step 1.7: UV & Modern Docker Setup**

**Tasks:**
- [x] Configure `pyproject.toml` with `dev` dependency groups and `local` extra
- [x] Update `Dockerfile` to use `uv` for lightning-fast, reproducible builds
- [x] Consolidate Build Modes (`development`, `production`, `local`)
- [x] Fix Docker Volume mapping for `.venv` (Anonymous volume)
- [x] Deprecate and remove `requirements*.txt` files
- [x] Full Stack Verification (UV-based build):
  - [x] History Persistence (test_final)
  - [x] Multi-user Analytics (test_v2)

---

### **Step 2: Token Tracking Service ✅ COMPLETE (6 hours)**

**Status**: ✅ **COMPLETE** (2026-02-01)

**Location**: `backend/services/token_tracker.py`

**Implementation Summary:**
- ✅ TokenTracker service created with comprehensive tracking
- ✅ `check_monthly_limit()` function implemented (not yet called pre-emptively)
- ✅ `log_token_usage()` with post-call logging
- ✅ Agent-specific tracking (router, sql_writer, critic, etc.)
- ✅ Cost calculation accurate (Claude 4.5: $3/M input, $15/M output)
- ✅ Integration with `llm_agent.py` and `langgraph_agent.py`
- ✅ Database schema with `agent_type` column

**Verification Results (test_v2 user):**
```sql
-- Total usage: 21,659 tokens / 1,000,000 limit (2.17%)
-- Breakdown by agent:
--   router: 9,819 tokens (45.3%)
--   sql_writer: 6,476 tokens (29.9%)
--   critic: 3,678 tokens (17.0%)
--   data_viz: 1,686 tokens (7.8%)
-- Cost: $0.4553 USD
```

**What Works:**
- ✅ Idempotent logging (request_id prevents duplicates)
- ✅ Fast monthly limit checks (indexed query on user_id + calendar_month)
- ✅ Cost calculation (Bedrock pricing for Claude Sonnet/Haiku)
- ✅ Flexible metadata storage (JSONB)
- ✅ Agent-level granularity for analytics

**What's Missing (See Step 2.5):**
- ❌ Pre-emptive quota enforcement (check before LLM calls)
- ❌ HTTP 429 responses when quota exceeded
- ❌ Warning thresholds (80%, 90%, 95%)
- ❌ Frontend usage indicators

---

### **Step 2.5: Pre-emptive Quota Enforcement ✅ COMPLETE (4 hours)**

**Status**: ✅ **COMPLETE** (2026-02-01)

**Objective**: Enforce monthly token limits BEFORE making LLM calls to prevent quota overruns.

**Implementation Summary:**
- ✅ Added `QuotaExceededException` custom exception class
- ✅ Pre-call quota checks in `llm_agent._call_llm()` with user_id parameter
- ✅ Pre-call quota checks in `langgraph_agent._invoke_with_tracking()`
- ✅ HTTP 429 handler in `main.py` with detailed error response
- ✅ `get_usage_status()` method with warning thresholds (80%, 90%, 95%)
- ✅ Exception re-raising to avoid catching quota exceptions as generic errors

**Verification Results:**
- ✅ Requests succeed when under quota
- ✅ Requests rejected with HTTP 429 when over quota
- ✅ No tokens consumed for rejected requests (pre-emptive check working)
- ✅ Error response includes: tokens used, tokens limit, month, reset date
- ✅ Works across all modes: fast, thinking, multi-agent

**Example HTTP 429 Response:**
```json
{
  "error": "Monthly token quota exceeded",
  "details": {
    "user_id": "...",
    "tokens_used": 65536,
    "tokens_limit": 65526,
    "month": "2026-02",
    "reset_date": "2026-03-01"
  },
  "message": "You have used 65,536 of your 65,526 monthly tokens. Quota resets on 2026-03-01."
}
```

---

### **Step 3: API Endpoints (6 hours)**

**Status**: 🚧 **IN PROGRESS**
        self.used = used
        self.limit = limit
        self.reset_date = reset_date
        super().__init__(
            f"Monthly quota exceeded: {used}/{limit} tokens used. "
            f"Resets on {reset_date}."
        )
```

**Location**: `backend/main.py`

```python
@app.exception_handler(QuotaExceededException)
async def quota_exceeded_handler(request: Request, exc: QuotaExceededException):
    """Return HTTP 429 when quota exceeded."""
    return JSONResponse(
        status_code=429,
        content={
            "error": "quota_exceeded",
            "message": "Monthly token limit exceeded",
            "details": {
                "tokens_used": exc.used,
                "tokens_limit": exc.limit,
                "reset_date": exc.reset_date,
            }
        }
    )
```

**3. Add Warning Thresholds (1 hour)**

**Location**: `backend/services/token_tracker.py`

```python
class TokenTracker:
    async def check_monthly_limit(
        self, 
        user_id: UUID,
        provider: str = "bedrock"
    ) -> tuple[bool, int, int, Optional[str]]:
        """
        Returns:
            (can_proceed, tokens_used, tokens_limit, warning_level)
            warning_level: None | "warning_80" | "warning_90" | "warning_95"
        """
        current_month = datetime.now().strftime("%Y-%m")
        
        user = self.db.query(User).filter(User.id == user_id).first()
        limit = user.monthly_token_limit
        
        usage = self.db.query(func.sum(TokenUsage.total_tokens)).filter(
            TokenUsage.user_id == user_id,
            TokenUsage.calendar_month == current_month,
            TokenUsage.provider == provider
        ).scalar() or 0
        
        can_proceed = usage < limit
        usage_pct = (usage / limit * 100) if limit > 0 else 0
        
        # Determine warning level
        warning = None
        if usage_pct >= 95:
            warning = "critical_95"
        elif usage_pct >= 90:
            warning = "warning_90"
        elif usage_pct >= 80:
            warning = "warning_80"
        
        return can_proceed, usage, limit, warning
```

**4. Update Integration Points**

**Files to modify:**
- [x] `backend/services/llm_agent.py` - Add check in `_call_llm()`
- [x] `backend/services/langgraph_agent.py` - Add check in `_invoke_with_tracking()`
- [x] `backend/services/token_tracker.py` - Add `QuotaExceededException` class
- [x] `backend/main.py` - Add exception handler for HTTP 429
- [x] `backend/tests/test_quota_enforcement.py` - Add enforcement tests

**Verification Steps:**
1. Set test user quota to 10,000 tokens
2. Make LLM requests until quota exhausted
3. Verify HTTP 429 returned on next request
4. Verify warning headers at 80%, 90%, 95% thresholds
5. Verify quota resets on first day of next month

---

### **Step 3: API Endpoints for Usage Monitoring (3 hours)**

**Status**: ✅ **COMPLETE** (Implemented 2026-02-01)

**Implementation Summary:**
- Created `backend/routers/token_usage.py` with 5 REST API endpoints
- Implemented 7 Pydantic response models for type-safe APIs
- Added JWT authentication with role-based access control
- Comprehensive error handling (401, 403, 404, 422, 429, 500)
- Full OpenAPI documentation with examples
- Manual and automated testing completed (100% pass rate)

**Endpoints Implemented:**
1. `GET /api/v1/token-usage` - Current month usage for authenticated user
2. `GET /api/v1/token-usage/monthly` - Historical monthly breakdown
3. `GET /api/v1/token-usage/status` - Usage status with warning levels
4. `PUT /api/v1/token-usage/admin/users/{user_id}/quota` - Admin quota updates
5. `GET /api/v1/token-usage/admin/users` - Admin view all users' usage

**Testing Results:**
```bash
# All endpoints verified working:
✅ GET /api/v1/token-usage → 200 OK (Current usage with warnings)
✅ GET /api/v1/token-usage/monthly → 200 OK (Historical breakdown)
✅ GET /api/v1/token-usage/status → 200 OK (Warning thresholds)
✅ PUT /api/v1/token-usage/admin/users/{id}/quota → 200 OK (Quota updated)
✅ GET /api/v1/token-usage/admin/users → 200 OK (All users visible)
✅ Unauthorized requests → 401 Unauthorized
✅ Non-admin requests to admin endpoints → 403 Forbidden
```

**Location**: `backend/main.py`

```python
@app.get("/api/usage/monthly")
async def get_monthly_usage(
    current_user: dict = Depends(get_current_user)
):
    """Get current month's token usage for authenticated user."""
    user_id = current_user["id"]
    tracker = TokenTracker(db)
    
    can_proceed, used, limit = await tracker.check_monthly_limit(user_id)
    
    return {
        "user_id": user_id,
        "month": datetime.now().strftime("%Y-%m"),
        "tokens_used": used,
        "tokens_limit": limit,
        "tokens_remaining": limit - used,
        "usage_percentage": (used / limit * 100) if limit > 0 else 0,
        "can_make_requests": can_proceed
    }

@app.get("/api/usage/history")
async def get_usage_history(
    months: int = 3,
    current_user: dict = Depends(get_current_user)
):
    """Get historical token usage for last N months."""
    user_id = current_user["id"]
    
    history = db.query(UserMonthlyUsage).filter(
        UserMonthlyUsage.user_id == user_id
    ).order_by(UserMonthlyUsage.calendar_month.desc()).limit(months).all()
    
    return {"history": history}
```

---

### **Step 4: Frontend Integration (3 hours)**

**Status**: ✅ **COMPLETE**

**Implemented Files:**
- `frontend/src/components/Usage/UsageIndicator.tsx` (234 lines)
- `frontend/src/components/Usage/UsageNotifications.tsx` (184 lines)
- `frontend/src/pages/UsageDashboard.tsx` (275 lines)
- `frontend/src/pages/AdminQuotaManagement.tsx` (386 lines)
- `frontend/src/services/tokenUsageService.ts` (127 lines)
- `frontend/src/utils/auth.ts` (29 lines) **NEW**

**Deliverables:**
- ✅ Always-visible usage indicator in header with color-coded warnings
- ✅ Toast notifications when approaching/exceeding quota (90%, 95%, 100%)
- ✅ Full-page usage dashboard with historical charts
- ✅ Admin page for viewing and editing all user quotas
- ✅ Smart authentication polling (50ms intervals, 2s fallback)
- ✅ Comprehensive null safety checks throughout
- ✅ Modern React patterns (useCallback, proper hooks usage)
- ✅ DRY principles applied (shared auth utility)
- ✅ TypeScript best practices (no `any` types)
- ✅ All runtime errors resolved (401, TypeError fixes)

**Code Modernization Report:**
See [`docs/reports/current/frontend_modernization_summary.md`](../../reports/current/frontend_modernization_summary.md) for detailed improvements.

---

## ✅ Acceptance Criteria

**Phase 1 - Core Tracking (COMPLETE):**
- [x] PostgreSQL schema created and Alembic migration applied
- [x] Token usage logged for every Bedrock LLM call
- [x] Agent-specific tracking (router, sql_writer, critic, data_viz)
- [x] Cost calculation accurate (Claude 4.5 pricing)
- [x] Database queries performant (< 10ms)
- [x] Integration tests passing (21,659 tokens tracked for test_v2)

**Phase 1.5 - Pre-emptive Enforcement (COMPLETE):**
- [x] `check_monthly_limit()` called BEFORE LLM invocations
- [x] HTTP 429 returned when quota exceeded
- [x] Warning thresholds implemented (80%, 90%, 95%)
- [x] QuotaExceededException with reset date information
- [x] Unit tests for pre-emptive enforcement

**Phase 2 - API Endpoints (COMPLETE):**
- [x] API endpoints return accurate usage data (`/api/v1/token-usage`)
- [x] Usage history endpoint (`/api/v1/token-usage/monthly`)
- [x] Status endpoint with warning levels (`/api/v1/token-usage/status`)
- [x] Admin override capability for quota increases
- [x] Admin endpoint to view all users' usage

**Phase 3 - Frontend Integration (COMPLETE):**
- [x] Frontend displays usage indicator in header
- [x] Visual warnings when approaching quota limits
- [x] Usage dashboard with historical charts
- [x] Admin UI for quota management
- [x] React 2026 standards compliance
- [x] All runtime errors resolved
- [x] TypeScript best practices applied
- [x] DRY violations eliminated

---

## 🧪 Testing Strategy

**Completed Tests:**
```python
# backend/tests/test_token_tracking_manual.py
# ✅ Basic token logging verified
# ✅ Monthly aggregation accurate (test_v2: 21,659 tokens)
# ✅ Agent-level breakdown working
# ✅ Cost calculation correct ($0.4553 USD)
```

**Required Tests for Step 2.5:**
```python
# backend/tests/test_quota_enforcement.py

async def test_pre_emptive_quota_check():
    """Verify quota check happens BEFORE LLM call."""
    # Set user limit to 10,000 tokens
    # Log 9,500 tokens usage
    # Make LLM request (should succeed)
    # Make another request (should fail with HTTP 429)

async def test_quota_exception_format():
    """Verify QuotaExceededException has correct structure."""
    # Exceed quota
    # Assert exception contains: used, limit, reset_date
    # Assert HTTP 429 response format

async def test_warning_thresholds():
    """Verify warnings at 80%, 90%, 95% usage."""
    # Set limit to 10,000 tokens
    # Log 8,000 tokens → Assert warning_80
    # Log 9,000 tokens → Assert warning_90
    # Log 9,500 tokens → Assert critical_95

async def test_monthly_reset():
    """Verify quota resets on first day of next month."""
    # Mock current date to 2026-01-31
    # Exceed quota (9,999/10,000)
    # Mock date to 2026-02-01
    # Verify usage resets to 0

async def test_token_logging_idempotency():
    """Verify duplicate request_id doesn't double-count."""
    # Log usage with request_id=abc123
    # Log same request_id again
    # Assert only one record in DB
```

---

## 📈 Performance Considerations

1. **Materialized View Refresh**: Use `pg_cron` or background FastAPI job every 5 minutes
2. **Index Strategy**: Composite indexes on (user_id, calendar_month, provider)
3. **Wait_time Pooling**: SQLAlchemy pool_size=20, max_overflow=10
4. **Caching**: Redis cache for `/api/usage/monthly` (TTL: 60s)

---

## 🚀 Deployment Checklist

**Phase 1 - Core Tracking (COMPLETE):**
- [x] Add PostgreSQL to `docker-compose.yml`
- [x] Run Alembic migration: `uv run alembic upgrade head`
- [x] Verify PostgreSQL schema created correctly
- [x] Update `.env` with PostgreSQL credentials
- [x] Deploy backend with token tracking integration
- [x] Verify tracking working in production (test_v2: 21,659 tokens logged)

**Phase 1.5 - Pre-emptive Enforcement (IN PROGRESS):**
- [ ] Deploy quota enforcement to staging
- [ ] Test HTTP 429 responses with test users
- [ ] Verify warning thresholds working
- [ ] Monitor error rates and latency (first 24h)
- [ ] Document quota increase process for admins

**Phase 2 - User-Facing Features (PENDING):**
- [ ] Deploy usage API endpoints
- [ ] Deploy frontend with UsageIndicator component
- [ ] Add usage monitoring to observability stack
- [ ] Create runbook for quota management

---

## 📚 Related Plans

- **Phase 2**: Token tracking for Gemini, Anthropic, Local → [`../backlog/token_tracking_phase2.md`](../backlog/token_tracking_phase2.md)
- **Phase 2**: Real-time usage notifications (WebSocket)
- **Phase 2**: Tiered pricing plans (free, pro, enterprise)
- **Phase 2**: Token rollover (unused tokens carry to next month)
- **Phase 2**: Cost alerts (email when 80% limit reached)
- **Phase 2**: Usage analytics dashboard (charts, trends)
- **Phase 3**: Cost billing and invoice generation
- **Phase 4**: Admin dashboard for usage analytics

---

## 💡 Phase 1 Scope (Updated)

**✅ COMPLETE (Phase 1):**
- ✅ PostgreSQL container setup (18.1-alpine)
- ✅ Bedrock token tracking (post-call logging)
- ✅ Agent-specific tracking (router, sql_writer, critic, data_viz)
- ✅ Cost calculation (Claude 4.5 pricing)
- ✅ Database schema with `agent_type` column
- ✅ Integration with llm_agent.py and langgraph_agent.py
- ✅ Verification with test_v2 user (21,659 tokens tracked)

**🚧 IN PROGRESS (Phase 1.5 - Pre-emptive Enforcement):**
- 🚧 Pre-emptive quota checks before LLM calls
- 🚧 HTTP 429 responses when quota exceeded
- 🚧 Warning thresholds (80%, 90%, 95%)
- 🚧 QuotaExceededException with reset dates

**🔲 PENDING (Phase 2 - User-Facing Features):**
- ❌ Usage API endpoints (`/api/usage/monthly`)
- ❌ Frontend usage indicator component
- ❌ Usage history endpoint
- ❌ Admin override capability

**OUT of scope (Phase 3+):**
- ❌ Other LLM providers (Gemini, Anthropic, Local)
- ❌ Advanced alerts/notifications (email, Slack)
- ❌ Billing/invoicing
- ❌ Analytics dashboards
- ❌ Token rollover (unused tokens carry to next month)
---

## 📝 Verification Results (2026-02-01)

**Test User**: `test_v2`
**Verification Period**: Multi-session testing with various analytics queries

### Token Usage Breakdown:
```
Total Tokens: 21,659 / 1,000,000 (2.17% of quota)
Total Cost: $0.4553 USD

By Agent:
  - router:      9,819 tokens (45.3%) - Query classification
  - sql_writer:  6,476 tokens (29.9%) - SQL generation
  - critic:      3,678 tokens (17.0%) - SQL validation
  - data_viz:    1,686 tokens (7.8%)  - Chart configuration
```

### Key Findings:
1. ✅ **Accurate Tracking**: All tokens logged with correct agent attribution
2. ✅ **Cost Calculation**: Claude Sonnet 4.5 pricing verified ($3/M input, $15/M output)
3. ✅ **Performance**: Token logging adds < 5ms overhead per request
4. ✅ **Idempotency**: request_id prevents duplicate entries
5. ❌ **Enforcement Gap**: `check_monthly_limit()` not called pre-emptively

### Next Steps (Step 2.5):
- Add pre-call quota checks in `_call_llm()` and `_invoke_with_tracking()`
- Implement HTTP 429 responses when quota exceeded
- Add warning thresholds at 80%, 90%, 95% usage levels
- Create `QuotaExceededException` with reset date information