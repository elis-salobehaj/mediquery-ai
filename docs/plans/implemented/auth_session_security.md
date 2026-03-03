---
title: "Auth Session Timeout & 401 Redirect"
status: completed
priority: high
estimated_hours: 2-3
dependencies: []
created: 2026-02-10
completed: 2026-02-10
related_files:
  - backend/config.py
  - backend/services/auth_service.py
  - backend/api/v1/endpoints/auth.py
  - frontend/src/App.tsx
  - frontend/src/utils/auth.ts
  - frontend/src/pages/UsageDashboard.tsx
  - frontend/src/pages/AdminQuotaManagement.tsx
  - frontend/src/components/Usage/UsageIndicator.tsx
  - frontend/src/components/Usage/UsageNotifications.tsx
---

## Goal

1. Increase JWT session timeout from 30 minutes to 1 hour.
2. Ensure frontend detects expired/invalid tokens, clears localStorage, and redirects to `/login`.

**Follow-up**: Migrate JWT from localStorage to HttpOnly cookies — see [backlog/httponly_cookie_auth.md](../backlog/httponly_cookie_auth.md).

## Current State Assessment

### Session Timeout (30 min, hardcoded in 2 places)
- `backend/services/auth_service.py:16` — `ACCESS_TOKEN_EXPIRE_MINUTES = 30` (module-level constant, unused by endpoints)
- `backend/api/v1/endpoints/auth.py:54` — `access_token_expires = timedelta(minutes=30)` (hardcoded in `/token` endpoint only)
- `backend/api/v1/endpoints/auth.py:86` — `/register` endpoint uses default of `15 min` (falls through to `create_access_token` default)
- `backend/api/v1/endpoints/auth.py:101` — `/guest` endpoint uses `timedelta(hours=24)` (intentional, separate)
- `backend/services/auth_service.py:112` — `create_access_token()` fallback default is 15 minutes

**Problem**: Timeout is hardcoded in multiple places with inconsistent values. Not sourced from `settings.*` (violates AGENTS.md Rule #2).

### Silent Logout (no frontend handling)
- Currently: When the JWT expires, backend returns `401`. Components individually handle this:
  - `UsageDashboard.tsx:35` — Sets error string "Authentication required"
  - `AdminQuotaManagement.tsx:35` — Sets error string "Authentication required"
  - `UsageIndicator.tsx:33` — Sets error string "Authentication required"
  - `UsageNotifications.tsx:33` — Silently suppresses 401/403
- **No global interceptor catches 401** to trigger logout + redirect
- Existing axios interceptor in `App.tsx:127-142` only handles `429` (quota exceeded), not `401`
- User stays on the page with a stale UI and must manually navigate to login

### Token in localStorage (XSS vulnerability)
- **Auth keys**: `mediquery_token`, `mediquery_user`, `role`
- **Non-auth keys** (safe to keep in localStorage): `theme`, `agentMode`, `dismissed_usage_notifications`
- 24 `localStorage` references across 8 files touch auth tokens
- No HttpOnly cookies, no CSRF protection
- Any XSS vulnerability (even via a dependency) can steal the JWT and impersonate the user
- `clearAuth()` in `utils/auth.ts` already handles cleanup (removes token, user, role)

### Existing Auth Flow
```
Login → POST /auth/token → JWT in response body → stored in localStorage
       → axios.defaults.headers['Authorization'] = 'Bearer <token>'
       → All API calls use Authorization header
Logout → POST /auth/logout (blacklists JWT) → clearAuth() → redirect
```

## Implementation Steps

### Phase 1: Centralize Timeout to `settings.*` and Increase to 1 Hour

- [x] **1.1 Add `access_token_expire_minutes` to Settings** ✅
  - File: `backend/config.py`
  - Added: `access_token_expire_minutes: int = 60` under `# Auth` section
  - This makes it configurable via `.env` file (`ACCESS_TOKEN_EXPIRE_MINUTES=60`)

- [x] **1.2 Update `auth_service.py` to use `settings.*`** ✅
  - File: `backend/services/auth_service.py`
  - Removed hardcoded `ACCESS_TOKEN_EXPIRE_MINUTES = 30` constant (line 16)
  - Updated `create_access_token()` default to use `settings.access_token_expire_minutes`

- [x] **1.3 Update `/token` endpoint to use `settings.*`** ✅
  - File: `backend/api/v1/endpoints/auth.py`
  - Changed line 54: `timedelta(minutes=30)` → `timedelta(minutes=settings.access_token_expire_minutes)`

- [x] **1.4 Update `/register` endpoint to use `settings.*`** ✅
  - File: `backend/api/v1/endpoints/auth.py`
  - Added explicit `expires_delta=timedelta(minutes=settings.access_token_expire_minutes)` to `create_access_token()` call

- [x] **1.5 Keep `/guest` endpoint at 24h** ✅ (intentional)
  - No change — guest accounts have different lifecycle

### Phase 2: Frontend — Global 401 Interceptor + Redirect

- [x] **2.1 Add global 401 interceptor to axios** ✅
  - File: `frontend/src/App.tsx`
  - Extended existing `429` interceptor to also handle `401`:
    - Calls `clearAuth()` from `utils/auth.ts`
    - Sets `token` state to `null` (triggers React re-render)
    - Navigates to `/login`
    - Skips 401 handling for `/auth/token` and `/auth/register` endpoints (login/register show their own errors)
  - ANY expired token from ANY component now triggers a clean redirect

- [x] **2.2 Add token expiry check on app mount** ✅
  - File: `frontend/src/utils/auth.ts`
  - Added `isTokenExpired(): boolean` function that decodes JWT and checks `exp` claim
  - File: `frontend/src/App.tsx`
  - On mount, checks `isTokenExpired()` — if expired, calls `clearAuth()` before rendering
  - Prevents stale tokens from sitting in localStorage between sessions

- [x] **2.3 Remove per-component 401 handling** ✅
  - Files: `UsageDashboard.tsx`, `AdminQuotaManagement.tsx`, `UsageIndicator.tsx`
  - Removed individual `if (err.response?.status === 401)` blocks
  - Now handled globally by the interceptor
  - Kept non-auth error handling (network errors, 403, etc.)

- [x] **2.4 Test redirect flow** ✅
  - Verify: Expired token → 401 from backend → interceptor clears localStorage → redirect to `/login`
  - Verify: Login endpoints (401 = wrong password) do NOT trigger redirect
  - Verify: ProtectedRoute still works (checks localStorage for token)
  - Verify: Guest accounts with 24h expiry are unaffected

## Files to Modify

| File | Phase | Change |
|------|-------|--------|
| `backend/config.py` | 1 | Add `access_token_expire_minutes: int = 60` |
| `backend/services/auth_service.py` | 1 | Remove hardcoded constant, use `settings.*` |
| `backend/api/v1/endpoints/auth.py` | 1 | Use settings for timeout in all endpoints |
| `frontend/src/App.tsx` | 2 | Global 401 interceptor, token expiry check on mount |
| `frontend/src/utils/auth.ts` | 2 | Add `isTokenExpired()` |
| `frontend/src/pages/UsageDashboard.tsx` | 2 | Remove per-component 401 handling |
| `frontend/src/pages/AdminQuotaManagement.tsx` | 2 | Remove per-component 401 handling |
| `frontend/src/components/Usage/UsageIndicator.tsx` | 2 | Remove per-component 401 handling |
