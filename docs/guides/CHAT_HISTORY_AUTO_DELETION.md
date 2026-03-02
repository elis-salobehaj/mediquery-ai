# Chat History Auto-Deletion

## Overview

The chat history system is designed to delete expired chat threads from PostgreSQL based on a configured retention period. Threads are pruned based on their `updated_at` timestamp.

> **Current status**: The `CHAT_HISTORY_RETENTION_HOURS` configuration key is defined and validated by Zod in `backend/src/config/env.config.ts`. Manual thread deletion via API is fully working. **Automated scheduled pruning is not yet implemented** — the scheduler is planned for a future release. This document describes both the current state and the planned implementation.

## Configuration

### Zod Environment Schema

The retention period is defined in `backend/src/config/env.config.ts`:

```typescript
// backend/src/config/env.config.ts
CHAT_HISTORY_RETENTION_HOURS: z.coerce.number().default(24),
```

### Environment Variable

Set the retention period in `.env`:

```bash
CHAT_HISTORY_RETENTION_HOURS=24
```

The value is automatically parsed and validated at application startup via Zod. An invalid value (e.g. a non-numeric string) will prevent the application from starting.

### Common Retention Periods

- `24` = 1 day (default)
- `48` = 2 days
- `72` = 3 days
- `168` = 7 days (1 week)
- `720` = 30 days (1 month)

## How It Works

### 1. Startup Pruning (Planned)

When the backend starts, it will delete all threads where `updated_at < (now - CHAT_HISTORY_RETENTION_HOURS)`. This is not yet wired up; the config key exists and is available in `ConfigService`.

### 2. Periodic Pruning (Planned)

A NestJS `@Cron` scheduler will run periodically to prune expired threads. The implementation will live in `ThreadsService` using the `@nestjs/schedule` package.

### 3. Manual Deletion (Active)

A thread can be deleted on-demand by the user via the API. The frontend calls `DELETE /api/v1/threads/:threadId`, which invokes `ThreadsService.deleteThread()`. This cascades to associated messages via the database foreign key.

## Implementation Details

### Database

- **Table**: `chat_threads` (PostgreSQL, managed by Drizzle — see `packages/db/src/schema.ts`)
- **Pruning field**: `updated_at` — threads are considered expired when `updated_at < now() - interval 'N hours'`
- **Cascade**: Associated `chat_messages` rows are deleted via `ON DELETE CASCADE` foreign key

### Relevant Files

| File | Role |
| ---- | ---- |
| `backend/src/config/env.config.ts` | Zod schema — defines `CHAT_HISTORY_RETENTION_HOURS` with default `24` |
| `backend/src/threads/threads.service.ts` | `ThreadsService` — `deleteThread(threadId)` for on-demand deletion |
| `packages/db/src/schema.ts` | Drizzle schema — `chatThreads` + `chatMessages` table definitions |

### Current `deleteThread` Implementation

```typescript
// backend/src/threads/threads.service.ts (simplified)
async deleteThread(threadId: string) {
  await this.db
    .delete(chatThreads)
    .where(eq(chatThreads.id, threadId));
}
```

### Planned Scheduled Pruning (Not Yet Implemented)

When the scheduler is added, it will follow this pattern:

```typescript
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';

// Inside ThreadsService
@Cron(CronExpression.EVERY_HOUR)
async pruneExpiredThreads() {
  const retentionHours = this.configService.get<number>('CHAT_HISTORY_RETENTION_HOURS', 24);
  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
  await this.db
    .delete(chatThreads)
    .where(lt(chatThreads.updatedAt, cutoff));
}
```

This requires enabling `ScheduleModule.forRoot()` in `AppModule` and installing `@nestjs/schedule`.

## Testing

### Unit Tests

Unit tests for thread deletion are in `backend/test/threads/`:

```bash
cd backend
pnpm test
```

### Manual Deletion via API

```bash
# Delete a specific thread (requires valid JWT)
curl -X DELETE http://localhost:8001/api/v1/threads/<thread-id> \
  -H "Authorization: Bearer <token>"
```

### Verify Retention Config Is Loaded

```bash
# Start the backend and check env validation passes
cd backend
CHAT_HISTORY_RETENTION_HOURS=168 pnpm start:dev
```

## Logs

Once the scheduler is implemented, check backend logs for pruning activity:

- Startup: `"Chat history pruned on startup — N threads removed."`
- Periodic: `"Periodic chat history pruning completed — N threads removed."`
- Errors: `"Periodic history pruning failed: {error}"`

For manual deletion, the `ThreadsService` logs on the `DEBUG` level when a thread is deleted.
