# Token Tracking Research - AWS Bedrock Integration

## Research Question
Does AWS Bedrock provide actual token consumption data in API responses that we can track?

## Answer
✅ **YES** - Bedrock provides detailed token usage metadata in every API response.

## AWS Bedrock Token Usage Metadata

### Direct API Response Fields
- `inputTextTokenCount`: Number of tokens in the prompt/query
- `tokenCount`: Number of tokens generated in the response  
- Both fields are returned in the response metadata for every `InvokeModel` call

### LangChain Integration (`ChatBedrockConverse`)

```python
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import HumanMessage

llm = ChatBedrockConverse(model_id="...", region_name="us-east-1")
response = llm.invoke([HumanMessage(content="...")])

# Token usage available in response metadata:
usage = response.response_metadata.get('usage', {})
input_tokens = usage.get('input_tokens', 0)
output_tokens = usage.get('output_tokens', 0)

# Alternative (newer LangChain versions):
if hasattr(response, 'usage_metadata'):
    input_tokens = response.usage_metadata.get('input_tokens', 0)
    output_tokens = response.usage_metadata.get('output_tokens', 0)
```

### Additional Monitoring Options
1. **CloudWatch Metrics**: `InputTokenCount` and `OutputTokenCount` per invocation
2. **CloudWatch Logs**: Detailed `inputTokens` and `outputTokens` in logs (if enabled)
3. **CountTokens API**: Pre-invocation token estimation (no charge, useful for quota checks)
4. **Bedrock Playground**: Real-time token counts in console

## Current Implementation Gap

### Problem
Our `_call_llm()` method (line 286-287 in `llm_agent.py`) only extracts content:

```python
response = self.llm.invoke([HumanMessage(content=prompt)])
return response.content.strip()  # ❌ Discarding token metadata!
```

### Solution
Modify `_call_llm()` to return both content AND token usage:

```python
def _call_llm(self, prompt: str) -> tuple[str, dict]:
    """Returns (content, usage_metadata)"""
    response = self.llm.invoke([HumanMessage(content=prompt)])
    
    # Extract token usage
    usage = {}
    if hasattr(response, 'response_metadata'):
        usage = response.response_metadata.get('usage', {})
    elif hasattr(response, 'usage_metadata'):
        usage = response.usage_metadata
    
    return response.content.strip(), usage
```

## Implementation Requirements for Step 2

### Tasks
- [ ] Update `_call_llm()` to return token usage metadata
- [ ] Update all callers of `_call_llm()` to handle tuple return
- [ ] Create `TokenTracker` service to log usage to PostgreSQL
- [ ] Add token usage extraction for multi-agent calls (Navigator, SQL Writer, Critic)
- [ ] Implement pre-call quota checks using `check_monthly_limit()`
- [ ] Add cost calculation based on Bedrock pricing

### Bedrock Pricing (as of 2026-02-01)
- **Claude 3.5 Sonnet v2**: $3.00/M input tokens, $15.00/M output tokens
- **Claude 3.5 Haiku**: $0.80/M input tokens, $4.00/M output tokens

## Benefits
- ✅ Accurate billing and cost tracking
- ✅ Real-time quota enforcement  
- ✅ Usage analytics per user/agent/model
- ✅ Optimization insights (identify expensive queries)
- ✅ Budget alerts and forecasting

## References
- AWS Bedrock API Documentation
- LangChain AWS Integration Docs
- CloudWatch Metrics for Bedrock
