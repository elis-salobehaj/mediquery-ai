---
title: "Migrate JWT to HttpOnly Cookies (Security Hardening)"
status: backlog
priority: medium
estimated_hours: 4-6
dependencies:
  - docs/plans/active/auth_session_security.md
created: 2026-02-10
related_files:
  - backend/config.py
  - backend/services/auth_service.py
  - backend/api/v1/endpoints/auth.py
  - backend/api/v1/dependencies.py
  - backend/main.py
  - backend/domain/models.py
---

> **⚠️ LEGACY PLAN**: Backend file paths reference the old Python backend. When implementing,
> migrate to the NestJS equivalents: `backend/src/config/env.config.ts`, `backend/src/auth/auth.service.ts`,
> `backend/src/auth/auth.controller.ts`, `backend/src/auth/jwt-auth.guard.ts`.
  - frontend/src/App.tsx
  - frontend/src/utils/auth.ts
  - frontend/src/components/ProtectedRoute.tsx
  - frontend/src/components/Usage/UsageIndicator.tsx
  - frontend/src/components/Usage/UsageNotifications.tsx
  - frontend/src/pages/UsageDashboard.tsx
  - frontend/src/pages/AdminQuotaManagement.tsx
  - frontend/src/services/tokenUsageService.ts
---

## Goal

Migrate JWT storage from localStorage to HttpOnly cookies to eliminate XSS token theft risk. This is the OWASP-recommended approach for SPAs.

## Prerequisites

- ✅ Auth session timeout centralized to `settings.access_token_expire_minutes` (Phase 1 of auth_session_security)
- ✅ Global 401 interceptor + redirect working (Phase 2 of auth_session_security)

## Background & Security Analysis

**Why localStorage is dangerous for JWTs:**
- Any JavaScript running on the page (including XSS from npm dependencies) can read `localStorage.getItem('mediquery_token')` and exfiltrate the JWT
- HttpOnly cookies are **inaccessible to JavaScript** — even if XSS occurs, the attacker cannot steal the token
- This is the OWASP-recommended approach for SPAs

**HttpOnly cookie approach:**
- Backend sets `Set-Cookie: access_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/`
- Browser automatically sends cookie on every request to the same origin
- Frontend JavaScript never touches the token — no `localStorage`, no `Authorization` header
- CSRF protection via `SameSite=Strict` (blocks cross-origin requests) + optional CSRF token for extra safety

**Trade-offs:**
- ✅ XSS cannot steal tokens
- ✅ No manual header management in frontend
- ✅ Automatic cookie expiry matches JWT expiry
- ⚠️ Requires `SameSite` + CSRF token for cross-origin scenarios
- ⚠️ CORS configuration must allow credentials
- ⚠️ Needs graceful migration (support both mechanisms temporarily)

## Implementation Steps

### Phase 1: Backend — Cookie Auth Support

- [ ] **1.1 Add cookie configuration to Settings**
  - File: `backend/config.py`
  - Add settings:
    ```python
    # Auth cookies
    cookie_secure: bool = True        # Set False for local dev (no HTTPS)
    cookie_samesite: str = "lax"      # "strict" for max security, "lax" for usability
    cookie_domain: Optional[str] = None  # Set for cross-subdomain
    ```

- [ ] **1.2 Update login endpoint to set HttpOnly cookie**
  - File: `backend/api/v1/endpoints/auth.py`
  - Modify `/token` response to include `Set-Cookie` header:
    ```python
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    ```
  - **Still return token in response body** for transition period
  - Apply same pattern to `/register` and `/guest` endpoints

- [ ] **1.3 Update logout endpoint to clear cookie**
  - File: `backend/api/v1/endpoints/auth.py`
  - Add `response.delete_cookie("access_token", path="/")` to `/logout`

- [ ] **1.4 Update auth dependency to read from cookie OR header**
  - File: `backend/api/v1/dependencies.py`
  - Modify `get_current_user()` to check:
    1. `Authorization: Bearer <token>` header (existing — for backward compat)
    2. `access_token` cookie (new — preferred)
  - This dual-read approach ensures existing sessions work while new logins use cookies

- [ ] **1.5 Update CORS middleware for credentials**
  - File: `backend/main.py`
  - Ensure `allow_credentials=True` in CORS config
  - Ensure `allow_origins` is NOT `["*"]` (credentials require explicit origins)

- [ ] **1.6 Add CSRF protection**
  - Option A (recommended): Double-submit cookie pattern
    - Backend sets a non-HttpOnly `csrf_token` cookie on login
    - Frontend reads `csrf_token` cookie and sends it as `X-CSRF-Token` header on state-changing requests (POST, PUT, DELETE)
    - Backend validates header matches cookie
  - Option B: `SameSite=Strict` alone (simpler, but doesn't protect in all browsers)
  - Create `frontend/src/utils/csrf.ts` utility if using Option A

### Phase 2: Frontend — Remove localStorage Token Storage

- [ ] **2.1 Update frontend to stop storing token in localStorage**
  - File: `frontend/src/App.tsx`
  - `handleLogin()`: Remove `localStorage.setItem('mediquery_token', ...)` — cookie is set by backend
  - Keep `localStorage.setItem('mediquery_user', username)` and `localStorage.setItem('role', role)` for UI display (non-sensitive)
  - Remove `axios.defaults.headers.common['Authorization']` setup — browser sends cookie automatically
  - Add `axios.defaults.withCredentials = true` to enable cookie sending

- [ ] **2.2 Update `utils/auth.ts`**
  - `clearAuth()`: Remove `localStorage.removeItem('mediquery_token')` (no longer stored)
  - `getUserRole()`: Keep reading from `localStorage.getItem('role')` (still stored, non-sensitive)
  - `getUsername()`: Keep reading from `localStorage.getItem('mediquery_user')`
  - Remove `decodeToken()` usage for token-from-localStorage patterns
  - `isTokenExpired()`: Can no longer check client-side (token in HttpOnly cookie); rely on 401 interceptor instead

- [ ] **2.3 Update ProtectedRoute**
  - File: `frontend/src/components/ProtectedRoute.tsx`
  - Can no longer check `localStorage.getItem('mediquery_token')` since token is in cookie
  - Options:
    - A: Check `localStorage.getItem('mediquery_user')` presence (set on login, cleared on logout)
    - B: Add lightweight `/auth/verify` endpoint that returns 200 if cookie is valid
  - Recommend Option A for simplicity (no extra network call on every route change)

- [ ] **2.4 Update components that directly read `mediquery_token`**
  - `UsageDashboard.tsx:60` — Remove `localStorage.getItem('mediquery_token')` guard (use user/role instead)
  - `AdminQuotaManagement.tsx:49` — Same change
  - `UsageIndicator.tsx:17,46` — Same change
  - `UsageNotifications.tsx:40` — Same change
  - `tokenUsageService.ts` — Ensure `withCredentials: true` on axios instance

- [ ] **2.5 Transition period: Support both mechanisms**
  - During rollout, backend accepts both header AND cookie (Phase 1.4)
  - Frontend sends cookie when available, falls back to header
  - After confirming all clients updated, remove localStorage token writes
  - Add deprecation warning in backend logs when token comes from header instead of cookie

### Phase 3: Verification & Cleanup

- [ ] **3.1 Test cookie auth**
  - Login → verify `Set-Cookie` header with `HttpOnly; Secure; SameSite`
  - API call → verify cookie sent automatically (no Authorization header needed)
  - Logout → verify cookie cleared
  - XSS simulation → verify `document.cookie` does NOT expose `access_token`
  - CSRF → verify cross-origin POST is blocked
  - Backward compat → verify old Authorization header still works during transition

- [ ] **3.2 Update documentation**
  - `docs/humans/context/CONFIGURATION.md` — Add cookie settings documentation
  - `docs/humans/context/ARCHITECTURE.md` — Update auth flow diagram
  - `docs/README.md` — Update plan status

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing sessions | Users forced to re-login | Dual auth (header + cookie) during transition |
| CSRF attacks after removing header auth | State-changing requests vulnerable | SameSite=Strict + CSRF token pattern |
| Local dev without HTTPS | `Secure` flag blocks cookies over HTTP | `cookie_secure: bool = False` default for dev |
| Components relying on `localStorage.getItem('mediquery_token')` | Auth checks break | Audit all 24 references; migrate to user/role check |
| Streaming SSE endpoints with cookies | Cookie may not be sent on EventSource | Verify `withCredentials` on SSE token-usage events |

## Files to Modify

| File | Phase | Change |
|------|-------|--------|
| `backend/config.py` | 1 | Add cookie settings |
| `backend/api/v1/endpoints/auth.py` | 1 | Set/clear HttpOnly cookies |
| `backend/api/v1/dependencies.py` | 1 | Read token from cookie OR header |
| `backend/main.py` | 1 | CORS `allow_credentials=True` |
| `frontend/src/App.tsx` | 2 | Remove localStorage token writes, add `withCredentials` |
| `frontend/src/utils/auth.ts` | 2 | Update `clearAuth()`, remove token-from-localStorage |
| `frontend/src/components/ProtectedRoute.tsx` | 2 | Check user presence instead of token |
| `frontend/src/pages/UsageDashboard.tsx` | 2 | Remove direct token checks |
| `frontend/src/pages/AdminQuotaManagement.tsx` | 2 | Remove direct token checks |
| `frontend/src/components/Usage/UsageIndicator.tsx` | 2 | Remove direct token checks |
| `frontend/src/components/Usage/UsageNotifications.tsx` | 2 | Remove direct token checks |
| `frontend/src/services/tokenUsageService.ts` | 2 | Add `withCredentials: true` |
| `frontend/src/utils/csrf.ts` | 1 | NEW: CSRF token utility (if Option A) |
| `docs/humans/context/CONFIGURATION.md` | 3 | Document cookie settings |
| `docs/humans/context/ARCHITECTURE.md` | 3 | Update auth flow |

## Implementation Notes

This plan should be:
1. Implemented behind a feature flag or as a separate PR
2. Tested thoroughly with both auth mechanisms active
3. Rolled out with a transition period where both header and cookie work
4. Finalized by removing localStorage token storage after confirming no regressions
