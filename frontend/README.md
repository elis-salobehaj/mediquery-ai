# Mediquery AI - Frontend

The futuristic interface for the Mediquery AI data agent. Built with React 19, Vite, and Tailwind CSS.

## 🌟 Key Features

- **Cyberpunk / Sci-Fi Aesthetic**: Dark mode glassmorphism UI with futuristic HUD design.
- **Explainable AI Interface**:
  - Displays the agent's **"Thinking Process"** in a collapsible detail view.
  - Shows multi-agent workflow steps (Schema Navigator → SQL Writer → Critic).
  - Displays raw SQL generation and validation results.
  - Transparent error handling with reflection feedback.
- **Dynamic Visualization Engine**:
  - `PlotlyVisualizer.tsx` component automatically selects 1 of 60+ chart types based on data.
  - Interactive zooming, panning, and exporting.
  - Real-time chart type switching.
- **Dual-Mode Toggles**:
  - **Fast/Thinking**: Choose between quick responses (⚡) or detailed reasoning (🧠)
  - **Single/Multi-Agent**: Toggle between simple queries (🤖) or complex multi-agent workflow (🤖)
- **CSV Export**: Download query results with a single click.
- **Responsive Layout**: Works on desktop and large tablets.

## 🛠️ Technology Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite (Blazing fast HMR)
- **Styling**: Tailwind CSS + Custom CSS Variables
- **Charts**: `react-plotly.js`
- **Markdown**: `react-markdown` for streaming text rendering

## 🚀 Development Setup

### Prerequisites

- **Node.js 24.13.1** (required)
- **pnpm** package manager

### Steps

1. **Install Dependencies**:

   ```bash
   pnpm install
   ```

2. **Run Development Server**:

   ```bash
   pnpm dev
   ```

   Access at `http://localhost:5173`.

3. **Build for Production**:
   ```bash
   pnpm build
   ```

## 📂 Project Structure

- `src/`
  - `main.tsx`: Application entry point.
  - `App.tsx`: Main layout wrapper and routing logic.
  - `index.css`: Global styles and Tailwind directives.
  - `components/`: Reusable UI components
    - `ChatBox.tsx`: The heart of the app. Handles user input, keeps chat history, and displays the **Thinking Process**.
    - `PlotlyVisualizer.tsx`: The brain of the visualization logic (60+ chart types).
    - `Configuration.tsx`: Settings panel for model selection (Local vs Cloud).
    - `Login.tsx`: User authentication interface.

## 🧪 Testing

We use **Playwright** for both Component and End-to-End testing.

### Component Tests (Fast - 10 tests)

```bash
# Run locally
npx playwright test

# Run in Docker (recommended for CI)
cd ..
./run-ci.sh  # Includes frontend component tests
```

**Test Coverage:**

- ChatBox component (user input, message rendering, toggles)
- Configuration component (model selection)
- Login component (authentication flows)
- PlotlyVisualizer component (chart rendering and switching)

### E2E Tests (Full Stack - 2 tests)

```bash
# Run locally (requires backend running)
npx playwright test -c playwright-e2e.config.ts

# Run in Docker (recommended - full stack)
cd ..
./run-e2e.sh  # Spins up backend + frontend + runs tests
```

**Test Coverage:**

- Guest login and authentication flow
- Configuration endpoint validation
- Chat history retrieval
- Full stack health checks

### Dockerized Testing

We use custom Dockerfiles with cached browsers for consistent CI/CD environments:

- `Dockerfile.test`: Component tests (isolated)
- Full stack via `docker-compose.test.yml` for E2E

## 📊 Token Usage Tracking (Phase 1 - Complete)

The frontend now includes comprehensive token usage monitoring and management features.

### User Features

#### 1. Usage Indicator (Always Visible)

- **Location**: Top-right header bar (visible on all pages)
- **Features**:
  - Real-time token usage display (used/limit)
  - Color-coded progress bar:
    - 🟢 Green (0-79%): Normal usage
    - 🟡 Yellow (80-89%): Medium usage
    - 🟠 Orange (90-94%): High usage
    - 🔴 Red (95-100%): Critical usage
  - Hover tooltip with detailed breakdown
  - Auto-refreshes every 30 seconds
  - Click to navigate to full dashboard

#### 2. Usage Dashboard (`/usage`)

- **Access**: Click usage indicator or sidebar navigation
- **Features**:
  - Current month usage card with detailed statistics
  - Visual progress bar with percentage
  - Remaining tokens display
  - Quota reset date
  - Historical usage chart (last 6 months)
  - Bar chart visualization of past usage
  - Info section explaining token usage

#### 3. Usage Notifications

- **Warning Banner** (90-99% usage):
  - Non-intrusive top banner
  - Dismissible (remembers dismissal)
  - Shows usage percentage
  - Quick link to dashboard
- **Critical Modal** (100% usage):
  - Full-screen modal (cannot be dismissed)
  - Blocks interaction until acknowledged
  - Shows reset date
  - Links to usage dashboard

### Admin Features

#### Quota Management (`/admin/quotas`)

- **Access**: Sidebar navigation (admin users only)
- **Features**:
  - Overview statistics (total users, usage levels)
  - Searchable/filterable user table
  - Sortable by username or usage percentage
  - Inline quota editing
  - Real-time usage status indicators
  - Color-coded warning levels
  - Batch operations support

### API Integration

The frontend integrates with 5 backend endpoints:

- `GET /api/v1/token-usage` - Current month usage
- `GET /api/v1/token-usage/monthly` - Historical breakdown
- `GET /api/v1/token-usage/status` - Warning levels
- `GET /api/v1/token-usage/admin/users` - All users (admin)
- `PUT /api/v1/token-usage/admin/users/{user_id}/quota` - Update quota (admin)

### Error Handling

- **401 Unauthorized**: Redirects to login
- **403 Forbidden**: Shows access denied message (admin pages)
- **429 Too Many Requests**:
  - Global interceptor catches all 429 errors
  - Shows quota exceeded alert
  - Automatically navigates to usage dashboard
  - Prevents further API calls

### Technical Implementation

**Files Created:**

- `src/services/tokenUsageService.ts` - API client with TypeScript interfaces
- `src/components/Usage/UsageIndicator.tsx` - Header usage widget
- `src/components/Usage/UsageNotifications.tsx` - Warning/critical notifications
- `src/pages/UsageDashboard.tsx` - Full usage dashboard
- `src/pages/AdminQuotaManagement.tsx` - Admin quota management

**Files Modified:**

- `src/App.tsx` - Added page routing, axios interceptor for 429
- `src/components/Layout/Layout.tsx` - Added usage indicator to header
- `src/components/Layout/Sidebar.tsx` - Added navigation links

### Testing Checklist

Manual testing steps:

1. ✅ Login and verify usage indicator appears in header
2. ✅ Hover over indicator to see tooltip with details
3. ✅ Click indicator to navigate to dashboard
4. ✅ Verify dashboard shows current usage and history
5. ✅ Test sidebar navigation to usage dashboard
6. ✅ Test sidebar navigation to admin quota page (admin only)
7. ✅ Verify 403 error on admin page for non-admin users
8. ✅ Test quota editing in admin page
9. ✅ Verify warning banner appears at 90%+ usage
10. ✅ Verify critical modal appears at 100% usage
11. ✅ Test dismissal of warning banner (persists)
12. ✅ Verify auto-refresh of usage indicator (30s interval)
13. ✅ Test 429 error handling (quota exceeded)
14. ✅ Verify responsive design on mobile/tablet

```bash
# From project root
./run-ci.sh   # Fast unit + component tests
./run-e2e.sh  # Full integration tests
```
