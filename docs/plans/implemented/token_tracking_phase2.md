---
title: "Token Consumption Tracking - Phase 2 (All LLM Providers)"
status: implemented
priority: medium
estimated_hours: 12-16
dependencies: ["token_tracking_phase1.md"]
date_updated: 2026-02-27
date_completed: 2026-02-27
---

# Token Consumption Tracking - Phase 2 (All LLM Providers)

> **Implementation Note (2026-02-27):** This phase has been implemented and superseded by the current TypeScript token tracking, SSE usage streaming, and consolidated multi-provider quota enforcement. This file is retained as historical scope context.

## 🎯 Objective

Extend token tracking from Phase 1 (Bedrock-only) to support all LLM providers: Gemini, Anthropic Direct API, and Local (Ollama).

## 📋 Scope

**Providers to add:**
1. **Google Gemini** (via Vertex AI or Direct API)
2. **Anthropic Claude** (Direct API, not via Bedrock)
3. **Local Models** (Ollama - qwen, sqlcoder, llama)

**Out of scope:**
- Multi-provider aggregation (sum tokens across all providers)
- Provider-specific pricing tiers
- Local model cost calculation (free, but track compute time)

---

## 🔧 Implementation Changes

### **Step 1: Update TokenTracker for Multi-Provider Support**

**No schema changes needed** - existing `provider` column supports all providers.

```python
# backend/services/token_tracker.py

class Provider(str, Enum):
    BEDROCK = "bedrock"
    GEMINI = "gemini"          # NEW
    ANTHROPIC = "anthropic"    # NEW
    LOCAL = "local"            # NEW

# Update cost calculation
def _calculate_cost(self, provider: Provider, model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate cost in USD based on provider pricing."""
    
    # Bedrock pricing (existing)
    if provider == Provider.BEDROCK:
        if "sonnet-4-5" in model:
            return (input_tokens / 1_000_000 * 3.00) + (output_tokens / 1_000_000 * 15.00)
        elif "haiku-4-5" in model:
            return (input_tokens / 1_000_000 * 0.80) + (output_tokens / 1_000_000 * 4.00)
    
    # Gemini pricing (NEW)
    elif provider == Provider.GEMINI:
        if "gemini-1.5-flash" in model:
            return (input_tokens / 1_000_000 * 0.075) + (output_tokens / 1_000_000 * 0.30)
        elif "gemini-1.5-pro" in model:
            return (input_tokens / 1_000_000 * 1.25) + (output_tokens / 1_000_000 * 5.00)
    
    # Anthropic Direct API pricing (NEW)
    elif provider == Provider.ANTHROPIC:
        if "claude-3-5-sonnet" in model:
            return (input_tokens / 1_000_000 * 3.00) + (output_tokens / 1_000_000 * 15.00)
        elif "claude-3-5-haiku" in model:
            return (input_tokens / 1_000_000 * 0.80) + (output_tokens / 1_000_000 * 4.00)
    
    # Local models (FREE, but track token count for analytics)
    elif provider == Provider.LOCAL:
        return 0.0
    
    return 0.0  # Unknown model/provider
```

---

### **Step 2: Add Provider-Specific Token Extraction**

Different providers return usage metadata in different formats:

```python
# backend/services/llm_agent.py

async def _extract_usage_metadata(self, result, provider: Provider) -> tuple[int, int]:
    """Extract input/output tokens from LLM result based on provider."""
    
    if provider == Provider.BEDROCK:
        # Bedrock returns usage_metadata in standardized format
        return (
            result.usage_metadata.get('input_tokens', 0),
            result.usage_metadata.get('output_tokens', 0)
        )
    
    elif provider == Provider.GEMINI:
        # Gemini returns token counts in response metadata
        usage = result.response_metadata.get('token_usage', {})
        return (
            usage.get('prompt_token_count', 0),
            usage.get('candidates_token_count', 0)
        )
    
    elif provider == Provider.ANTHROPIC:
        # Anthropic returns usage in top-level usage object
        usage = result.usage
        return (
            usage.input_tokens if hasattr(usage, 'input_tokens') else 0,
            usage.output_tokens if hasattr(usage, 'output_tokens') else 0
        )
    
    elif provider == Provider.LOCAL:
        # Ollama may not return token counts - estimate from text length
        # Use tokenizer approximation: 1 token ≈ 4 characters
        input_tokens = len(result.prompt) // 4 if hasattr(result, 'prompt') else 0
        output_tokens = len(result.content) // 4 if hasattr(result, 'content') else 0
        return (input_tokens, output_tokens)
    
    return (0, 0)  # Unknown provider

# Update decorator
@require_token_quota()
async def invoke(self, query: str, user_id: int, **kwargs):
    request_id = uuid4()
    provider = Provider(settings.active_provider)  # Dynamically detect
    
    # Execute LLM call
    result = await self._invoke_llm(query, **kwargs)
    
    # Extract usage (provider-specific)
    input_tokens, output_tokens = await self._extract_usage_metadata(result, provider)
    
    # Log usage
    await self.tracker.log_token_usage(
        user_id=user_id,
        provider=provider,
        model=self.get_active_model(),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        request_id=request_id
    )
    
    return result
```

---

### **Step 3: Update Limit Checking Logic**

**Decision: Per-provider limits or combined limit?**

**Option A: Shared limit** (1M tokens/month across ALL providers)
```python
async def check_monthly_limit(self, user_id: int) -> tuple[bool, int, int]:
    """Check total usage across all providers."""
    current_month = datetime.now().strftime("%Y-%m")
    
    # Sum tokens across ALL providers
    total_usage = self.db.query(
        func.sum(TokenUsage.total_tokens)
    ).filter(
        TokenUsage.user_id == user_id,
        TokenUsage.calendar_month == current_month
    ).scalar() or 0
    
    # ... rest of logic
```

**Option B: Per-provider limits** (1M for Bedrock, 500K for Gemini, etc.)
```python
async def check_monthly_limit(self, user_id: int, provider: Provider) -> tuple[bool, int, int]:
    """Check usage for specific provider."""
    # Get provider-specific limit from user settings
    limit_field = f"{provider.value}_monthly_limit"
    limit = getattr(user, limit_field, user.monthly_token_limit)
    
    # Query usage for this provider only
    usage = self.db.query(
        func.sum(TokenUsage.total_tokens)
    ).filter(
        TokenUsage.user_id == user_id,
        TokenUsage.calendar_month == current_month,
        TokenUsage.provider == provider.value
    ).scalar() or 0
    
    # ... rest of logic
```

**Recommendation: Option A for Phase 2** (simpler), add Option B in Phase 3 if needed.

---

### **Step 4: Frontend Updates**

**Multi-Provider Usage Breakdown:**

```tsx
// frontend/src/components/UsageIndicator.tsx

interface ProviderUsage {
  provider: string;
  tokens_used: number;
  cost_usd: number;
  percentage: number;
}

interface UsageData {
  total_tokens_used: number;
  total_tokens_limit: number;
  by_provider: ProviderUsage[];
  can_make_requests: boolean;
}

export function UsageIndicator() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  
  return (
    <div className="usage-breakdown">
      <div className="total-usage">
        <ProgressBar 
          value={usage.total_tokens_used} 
          max={usage.total_tokens_limit} 
        />
        <span>{usage.total_tokens_used.toLocaleString()} / {usage.total_tokens_limit.toLocaleString()} tokens</span>
      </div>
      
      <div className="provider-breakdown">
        {usage.by_provider.map(p => (
          <div key={p.provider} className="provider-row">
            <span className="provider-name">{p.provider}</span>
            <span className="provider-tokens">{p.tokens_used.toLocaleString()}</span>
            <span className="provider-cost">${p.cost_usd.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**API Endpoint:**
```python
@app.get("/api/usage/monthly")
async def get_monthly_usage(current_user: dict = Depends(get_current_user)):
    """Get usage breakdown by provider."""
    user_id = current_user["id"]
    current_month = datetime.now().strftime("%Y-%m")
    
    # Aggregate by provider
    by_provider = db.query(
        TokenUsage.provider,
        func.sum(TokenUsage.total_tokens).label('tokens_used'),
        func.sum(TokenUsage.cost_usd).label('cost_usd')
    ).filter(
        TokenUsage.user_id == user_id,
        TokenUsage.calendar_month == current_month
    ).group_by(TokenUsage.provider).all()
    
    total_used = sum(p.tokens_used for p in by_provider)
    limit = user.monthly_token_limit
    
    return {
        "total_tokens_used": total_used,
        "total_tokens_limit": limit,
        "total_cost_usd": sum(p.cost_usd for p in by_provider),
        "by_provider": [
            {
                "provider": p.provider,
                "tokens_used": p.tokens_used,
                "cost_usd": p.cost_usd,
                "percentage": (p.tokens_used / total_used * 100) if total_used > 0 else 0
            }
            for p in by_provider
        ],
        "can_make_requests": total_used < limit
    }
```

---

## ✅ Acceptance Criteria

- [ ] Token usage logged for Gemini API calls
- [ ] Token usage logged for Anthropic Direct API calls
- [ ] Token usage logged for Local (Ollama) calls (estimated tokens)
- [ ] Cost calculated accurately for all providers (except local = $0)
- [ ] Monthly limits enforced across all providers (combined total)
- [ ] Frontend displays per-provider usage breakdown
- [ ] API returns accurate multi-provider stats
- [ ] Unit tests for all new providers (95% coverage)

---

## 🧪 Testing Strategy

```python
# backend/tests/test_token_tracker_multiprovider.py

async def test_gemini_token_extraction():
    # Mock Gemini response with token_usage
    # Assert correct extraction

async def test_anthropic_token_extraction():
    # Mock Anthropic response
    # Assert correct extraction

async def test_local_token_estimation():
    # Mock Ollama response (no token counts)
    # Assert estimation logic works

async def test_combined_limit_enforcement():
    # User with 1000 token limit
    # Use 600 on Bedrock, 500 on Gemini
    # Assert next request blocked (total = 1100 > 1000)
```

---

## 📈 Migration from Phase 1

**Zero Breaking Changes:**
- Existing Bedrock tracking continues to work
- New providers opt-in via configuration flags
- No database schema changes required
- Frontend gracefully handles missing providers (shows "No usage" if never used)

---

## 🚀 Estimated Timeline

- **Step 1**: Token extraction logic - 4 hours
- **Step 2**: Cost calculation - 2 hours
- **Step 3**: Testing all providers - 4 hours
- **Step 4**: Frontend breakdown UI - 2 hours
- **Total**: 12-16 hours

---

## 💡 Future Considerations (Phase 3)

- [ ] Per-provider limits (separate Bedrock and Gemini quotas)
- [ ] Cost alerts per provider
- [ ] Provider failover (switch to cheaper provider when one hits limit)
- [ ] Usage forecasting (predict month-end total based on current rate)
