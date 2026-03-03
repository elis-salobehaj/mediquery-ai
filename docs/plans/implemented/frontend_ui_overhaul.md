---
status: implemented
priority: high
date_created: 2026-01-24
date_updated: 2026-01-24
related_files:
  - frontend/src/index.css
  - frontend/src/components/Login.tsx
  - frontend/src/components/Layout/Sidebar.tsx
  - frontend/src/components/Chat/ChatInterface.tsx
  - frontend/src/components/Chat/PlotlyVisualizer.tsx
  - frontend/src/components/Chat/InputBar.tsx
  - backend/config.py
  - backend/main.py
  - backend/services/llm_agent.py
completion:
  - [x] Phase 1 - Global Style Definition (OKLCH, Tailwind v4)
  - [x] Phase 2 - Container Query Components
  - [x] Phase 2.5 - Configuration & Verification
  - [x] Phase 2.6 - User Preference Persistence
  - [x] Phase 3 - Dynamic Theme Toggle
  - [x] Phase 4 - Visualizer Refactor
  - [x] Phase 5 - UX Polish (Cursors)
  - [x] Phase 6: README & Documentation Update
---

# Plan: Frontend UI Overhaul (2026)

**Date**: January 24, 2026
**Status**: Closed (Implemented)
**Goal**: High-performance Tailwind v4 architecture with OKLCH colors, container queries, and full theme support.

## Architecture Standards

| Principle | Implementation |
|-----------|----------------|
| **CSS-First Theming** | Design tokens in native CSS (`@theme`), no JS runtime |
| **OKLCH Colors** | Perceptually uniform lightness across modes |
| **Container Queries** | Components adapt to container width (`@container`) |
| **Mode Switching** | `data-theme` attribute on `<html>` |
| **Unified Config** | Pydantic v2 Settings as single source of truth |

## Implementation Phases

### Phase 1: Global Style Definition ✅
**Target**: `frontend/src/index.css`
- [x] OKLCH color space with Tailwind v4 `@theme`
- [x] Chart palette (6 accent colors)
- [x] Plotly background override

### Phase 2: Container Query Components ✅
**Target**: `Login.tsx`, `ChatInterface.tsx`, `Sidebar.tsx`
- [x] CSS variable migration (replaced hardcoded colors)
- [x] Container queries for responsive sizing
- [x] Theme types updated to include `clinical-slate`
- [x] Cursor-pointer on interactive elements

### Phase 2.5: Configuration & Verification 🔄
**Target**: `backend/config.py`, `backend/services/llm_agent.py`

#### 2.5.1 Unified Model Configuration
Expand `backend/config.py` to be single source of truth for ALL model configs:

```python
class Settings(BaseSettings):
    # Provider Priority (Bedrock wins if multiple are true)
    use_bedrock: bool = False
    use_gemini: bool = False  
    use_anthropic: bool = False
    use_local_model: bool = False
    
    # Bedrock Models
    bedrock_base_model: str = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
    bedrock_sql_writer_model: str = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
    bedrock_navigator_model: str = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
    bedrock_critic_model: str = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
    
    # Gemini Models
    gemini_base_model: str = "gemini-1.5-flash"
    gemini_sql_writer_model: str = "gemini-1.5-pro"
    gemini_navigator_model: str = "gemini-1.5-flash"
    gemini_critic_model: str = "gemini-1.5-flash"
    
    # Anthropic Models
    anthropic_base_model: str = "claude-3-5-sonnet-20241022"
    anthropic_sql_writer_model: str = "claude-3-5-sonnet-20241022"
    anthropic_navigator_model: str = "claude-3-5-haiku-20241022"
    anthropic_critic_model: str = "claude-3-5-haiku-20241022"
    
    # Local Models
    local_base_model: str = "qwen3:latest"
    local_sql_writer_model: str = "sqlcoder:7b"
    local_navigator_model: str = "qwen2.5-coder:7b"
    local_critic_model: str = "llama3.1"
    
    # Computed (set at startup based on priority)
    @property
    def active_provider(self) -> str: ...
    @property
    def base_model(self) -> str: ...
    @property
    def sql_writer_model(self) -> str: ...
    @property
    def navigator_model(self) -> str: ...
    @property
    def critic_model(self) -> str: ...
```

#### 2.5.2 LLM Agent Refactor
- [ ] Remove all hardcoded model strings from `llm_agent.py`
- [ ] Replace `if self.settings.use_local_model else gemini` with provider-agnostic calls
- [ ] Use `settings.active_provider` and `settings.base_model` everywhere

#### 2.5.3 Docker & Build Verification
- [ ] Ensure `docker compose up --build` succeeds
- [ ] Replace npm with pnpm in frontend Dockerfile
- [ ] Run end-to-end test query

### Phase 3: Dynamic Theme Toggle
- [ ] Verify `data-theme` attribute used consistently
- [ ] Ensure localStorage persistence for all 3 themes

### Phase 4: Visualizer Refactor
- [ ] Implement `useChartColors()` hook
- [ ] Remove `isDark ? ...` conditionals

### Phase 5: UX Polish
- [ ] Final cursor-pointer audit
- [ ] Model selector buttons

### Phase 6: README & Documentation Update
- [ ] Update main README
- [ ] Update AGENTS.md
- [ ] Update docs/INDEX.md

## Verification Plan

### Phase 2.5 Verification (Pre-Phase 3)
1. **Docker Build**: `docker compose up --build` succeeds
2. **End-to-End Query**: Submit "find patients by state" → get visualization
3. **Config Audit**: No hardcoded models in `llm_agent.py`
4. **Provider Priority**: If `USE_BEDROCK=true`, Bedrock is used regardless of other flags

### Theming (All 3 Modes)
- [ ] **Light Mode**: Clean whites/grays
- [ ] **Dark Mode (Abyss)**: Deep, not flat black
- [ ] **Clinical Slate**: Slate 800 background with industry accents
- [ ] **Dynamic Toggle**: All elements update instantly

### Visualizations
- [ ] Choropleth: Transparent background, OKLCH palette
- [ ] Bar/Pie: Uses chart accent colors
- [ ] All charts respect current theme

## Performance Goals

| Metric | Target |
|--------|--------|
| Bundle Size | < 10KB CSS |
| Theme Switch INP | < 50ms |
| CLS on Toggle | 0 |
