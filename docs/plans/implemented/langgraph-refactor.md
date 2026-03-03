---
status: active
priority: high
date_created: 2026-01-21
date_updated: 2026-01-24
related_files:
  - backend/services/langgraph_agent.py
  - backend/main.py
  - backend/requirements.txt
depends_on: []
blocks: []
assignee: null
completion:
  - [x] Step 1 - Configure Environment Variables (AWS Bedrock API key in place) ✅
  - [x] Step 2 - Add AWS Bedrock with Bearer Token Authentication ✅
  - [x] Step 3 - Fix _should_continue routing logic ✅
  - [x] Step 4 - Add early timeout checks to agent nodes ✅
  - [x] Step 5 - Track previous SQL attempts in state ✅
---

# Plan: Refactor Multi-Agent LangGraph Workflow + AWS Bedrock API Key Integration

**Date**: January 21, 2026  
**Status**: Active (In Progress)  
**Target File**: `backend/services/langgraph_agent.py`

## Problem Statement

The current multi-agent workflow in `langgraph_agent.py` is causing queries to appear "stuck" due to:
- Unnecessary retries for legitimate zero-row queries
- No SQL deduplication (same failed SQL retried)
- Missing early termination logic in agent nodes
- Local Ollama models hallucinating table names despite enhanced prompts

Additionally, we want to add AWS Bedrock as a cloud LLM provider using the **new API Key (Bearer Token) authentication** for simplified setup.

---

## Concept: Fast vs Thinking Models & Single vs Multi-Agent

### Fast vs Thinking Models

| Aspect | Fast Models (Haiku 4.5) | Thinking Models (Sonnet 4.5) |
|--------|-------------------------|------------------------------|
| **Latency** | ~200-500ms | ~1-3 seconds |
| **Token Cost** | ~$0.80/M input | ~$3/M input |
| **Reasoning** | Quick pattern matching | Deep chain-of-thought |
| **Use Case** | Validation, simple tasks | Complex SQL generation |

**In our app**: We use **fast models (Haiku 4.5)** for Navigator and Critic because they do simpler tasks (schema lookup, syntax validation). We use a **thinking model (Sonnet 4.5)** for SQL Writer because it needs to reason about complex query logic.

### Single-Agent vs Multi-Agent

| Aspect | Single-Agent | Multi-Agent (Our Approach) |
|--------|--------------|---------------------------|
| **Architecture** | One LLM does everything | Specialized LLMs per task |
| **Reliability** | Lower - one failure = total failure | Higher - each agent validates others |
| **Cost** | Lower - one call | Higher - multiple calls |
| **Speed** | Faster - single round-visit | Slower - sequential agents |

**How they combine**: Our multi-agent workflow uses **fast models for lightweight agents** (Navigator, Critic) and a **thinking model for the heavy-lifting agent** (SQL Writer). This balances:
- **Speed**: Fast models keep Navigator/Critic quick (~500ms each)
- **Quality**: Thinking model ensures SQL Writer produces correct SQL
- **Cost**: Only the SQL Writer uses expensive tokens

**Total latency estimate**: Navigator (500ms) + SQL Writer (2s) + Critic (500ms) = ~3 seconds per attempt

---

## Steps

### ⏸️ Step 1: Configure Environment Variables (PAUSE HERE)

**Add to `.env` file:**

```bash
# --- AWS Bedrock Configuration ---
USE_BEDROCK=true
AWS_BEDROCK_REGION=us-west-2
AWS_BEARER_TOKEN_BEDROCK=   # <-- POPULATE THIS WITH YOUR LONG-TERM API KEY

# Bedrock Model Configuration (Claude 4.5 family)
BEDROCK_SQL_WRITER_MODEL=us.anthropic.claude-sonnet-4-5-20250514-v1:0
BEDROCK_NAVIGATOR_MODEL=us.anthropic.claude-haiku-4-5-20250514-v1:0
BEDROCK_CRITIC_MODEL=us.anthropic.claude-haiku-4-5-20250514-v1:0
```

**⚠️ ACTION REQUIRED**: Generate your long-term API key from AWS Bedrock console and populate `AWS_BEARER_TOKEN_BEDROCK` before proceeding to Step 2.

**How to generate:**
1. AWS Console → Amazon Bedrock → API keys (left nav)
2. Click **Generate long-term API key**
3. Set expiration (recommend 90+ days for production, or no expiration for dev)
4. Copy the key to `.env`

**Key Features:**
- **No AWS CLI setup required** - just the bearer token
- **No ~/.aws/config needed** - boto3 auto-detects the env var
- **Long-term keys** - set expiration from 1 day to no expiration
- **IAM user auto-created** - with `AmazonBedrockLimitedAccess` policy
- **Bedrock-only access** - keys cannot access other AWS services

---

### Step 2: Add AWS Bedrock with Bearer Token Authentication + Update Dependencies

**Location**: `langgraph_agent.py` lines 105-190

#### 2.1 Update Dependencies

Add to `backend/requirements.txt`:

```
langchain-aws>=0.2.0
boto3>=1.35.0
```

#### 2.2 Add Conditional Import

```python
try:
    from langchain_aws import ChatBedrockConverse
    HAS_BEDROCK = True
except ImportError:
    logger.warning("langchain-aws not available")
    HAS_BEDROCK = False
```

#### 2.3 Model Configuration

```python
default_config = {
    # ... existing config ...
    "use_bedrock": os.getenv("USE_BEDROCK", "false").lower() == "true",
    "bedrock_region": os.getenv("AWS_BEDROCK_REGION", "us-west-2"),
    "bedrock_sql_writer_model": os.getenv("BEDROCK_SQL_WRITER_MODEL", "us.anthropic.claude-sonnet-4-5-20250514-v1:0"),
    "bedrock_navigator_model": os.getenv("BEDROCK_NAVIGATOR_MODEL", "us.anthropic.claude-haiku-4-5-20250514-v1:0"),
    "bedrock_critic_model": os.getenv("BEDROCK_CRITIC_MODEL", "us.anthropic.claude-haiku-4-5-20250514-v1:0"),
}
```

#### 2.4 LLM Initialization

```python
def _init_llms(self):
    use_ollama = self.config["use_ollama"]
    use_bedrock = self.config["use_bedrock"]
    bedrock_token = os.getenv("AWS_BEARER_TOKEN_BEDROCK")
    
    # Priority 1: Local Ollama (default)
    if use_ollama and HAS_OLLAMA:
        # ... existing Ollama initialization ...
    
    # Priority 2: AWS Bedrock with Bearer Token
    elif use_bedrock and HAS_BEDROCK and bedrock_token:
        logger.info(f"Using AWS Bedrock with Bearer Token auth in {self.config['bedrock_region']}")
        
        # boto3 auto-detects AWS_BEARER_TOKEN_BEDROCK env var
        self.schema_navigator_llm = ChatBedrockConverse(
            model_id=self.config["bedrock_navigator_model"],
            region_name=self.config["bedrock_region"],
            temperature=0.0,
        )
        
        self.sql_writer_llm = ChatBedrockConverse(
            model_id=self.config["bedrock_sql_writer_model"],
            region_name=self.config["bedrock_region"],
            temperature=0.0,
        )
        
        self.critic_llm = ChatBedrockConverse(
            model_id=self.config["bedrock_critic_model"],
            region_name=self.config["bedrock_region"],
            temperature=0.3,
        )
    
    # Priority 3: Cloud fallback (Google/Anthropic)
    else:
        # ... existing cloud initialization ...
```

---

### Step 3: Fix `_should_continue` Routing Logic
**Location**: `langgraph_agent.py` lines 708-745

- Reorder checks: timeout → max_attempts → validation null check
- Accept zero-row results for COUNT/aggregate queries as valid success
- Add SQL deduplication: if same SQL generated twice, exit early instead of retrying

```python
def _should_continue(self, state: AgentState) -> Literal["retry", "success", "max_attempts", "timeout"]:
    # 1. ALWAYS check timeout first
    elapsed = time.time() - state["start_time"]
    if elapsed > state["timeout_seconds"]:
        return "timeout"
    
    # 2. ALWAYS check max_attempts second
    if state["attempt_count"] >= state["max_attempts"]:
        return "max_attempts"
    
    # 3. Check for SQL deduplication
    if state["generated_sql"] and state["generated_sql"] in state.get("previous_sqls", []):
        state["thoughts"].append("Same SQL generated twice, stopping retry")
        return "max_attempts"
    
    # 4. Check validation
    if not state["validation_result"]:
        return "retry"
    
    # 5. Success/retry based on validation
    if state["validation_result"].get("valid"):
        row_count = state["validation_result"].get("row_count", 0)
        # Accept zero rows for count/aggregate queries
        if row_count == 0:
            query_lower = state["original_query"].lower()
            if any(kw in query_lower for kw in ["count", "how many", "total", "sum", "average"]):
                return "success"  # Zero is valid for aggregates
        if row_count >= 0:
            return "success"
    
    return "retry"
```

---

### Step 4: Add Early Timeout Checks to Each Agent Node

Add timeout guard at the start of `_schema_navigator_node`, `_sql_writer_node`, `_critic_node`:

```python
def _sql_writer_node(self, state: AgentState) -> AgentState:
    # Early timeout check
    if time.time() - state["start_time"] > state["timeout_seconds"]:
        state["thoughts"].append("Timeout reached, skipping SQL Writer")
        return state
    # ... rest of method
```

---

### Step 5: Track Previous SQL Attempts in State
**Location**: `langgraph_agent.py` lines 50-65

Add `previous_sqls: list[str]` field to `AgentState` TypedDict:

```python
class AgentState(TypedDict):
    # ... existing fields ...
    previous_sqls: list[str]  # Track generated SQL to detect duplicates
```

Update `_sql_writer_node` to append generated SQL:

```python
# After generating SQL
if sql:
    state["previous_sqls"] = state.get("previous_sqls", []) + [sql]
```

---

## Configuration Summary

| Setting | Value | Description |
|---------|-------|-------------|
| `USE_BEDROCK` | `true` | Enable Bedrock provider |
| `AWS_BEARER_TOKEN_BEDROCK` | (secret) | Long-term API key |
| `AWS_BEDROCK_REGION` | `us-west-2` | AWS region |
| `BEDROCK_SQL_WRITER_MODEL` | `us.anthropic.claude-sonnet-4-5-20250514-v1:0` | Claude Sonnet 4.5 (thinking) |
| `BEDROCK_NAVIGATOR_MODEL` | `us.anthropic.claude-haiku-4-5-20250514-v1:0` | Claude Haiku 4.5 (fast) |
| `BEDROCK_CRITIC_MODEL` | `us.anthropic.claude-haiku-4-5-20250514-v1:0` | Claude Haiku 4.5 (fast) |

---

## Further Considerations

1. **Reduce max_attempts from 3 to 2** - Claude 4.5 models follow instructions better than Ollama, enhanced prompting + deduplication catches failures faster

2. **Model cost estimates** (Claude 4.5 family):
   - Sonnet 4.5: ~$3/M input, ~$15/M output tokens
   - Haiku 4.5: ~$0.80/M input, ~$4/M output tokens
   - Per query estimate: ~$0.002-0.005 (2000-3000 tokens total)

3. **Fallback strategy**: Keep Ollama as fallback if Bedrock quota exceeded or network issues

4. ~~**Table corrections**~~: Removed - schema will be updated soon, making current corrections obsolete

---

## Testing Checklist

- [ ] Populate `AWS_BEARER_TOKEN_BEDROCK` in `.env`
- [ ] Install dependencies: `pip install langchain-aws>=0.2.0 boto3>=1.35.0`
- [ ] Verify bearer token authentication works with boto3
- [ ] Test SQL generation with Bedrock Claude 4.5 models
- [ ] Verify timeout checks work in each agent node
- [ ] Test SQL deduplication prevents infinite retries
- [ ] Test zero-row aggregate queries return success
- [ ] Benchmark Bedrock vs Ollama response times
- [ ] Test fallback to Ollama when Bedrock unavailable
