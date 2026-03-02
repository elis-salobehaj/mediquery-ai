# Chat History Auto-Deletion

## Overview
The chat history system automatically deletes expired chat threads from PostgreSQL based on the configured retention period. Threads are pruned based on their `updated_at` timestamp.

## Configuration

### Pydantic Settings (Recommended)
Set the retention period in `backend/config.py`:
```python
class Settings(BaseSettings):
    chat_history_retention_hours: int = 24  # Default: 24 hours (1 day)
```

### Environment Variable (Optional Override)
You can also override via environment variable:
```bash
CHAT_HISTORY_RETENTION_HOURS=24
```

### Common Retention Periods:
- `24` = 1 day (default)
- `48` = 2 days  
- `72` = 3 days
- `168` = 7 days (1 week)
- `720` = 30 days (1 month)

## How It Works

### 1. Startup Pruning
When the backend starts, it immediately deletes all messages older than the configured retention period.

### 2. Periodic Pruning
A background task runs every hour to automatically delete expired messages.

### 3. Manual Pruning
You can also manually trigger pruning:
```python
from services.chat_history import chat_history
chat_history.prune_old_messages()
```

## Implementation Details

### Database
- **Table**: `chat_threads` (PostgreSQL)
- **Pruning Logic**: Deletes threads where `updated_at < (now - retention_hours)`
- **Cascade**: Associated `chat_messages` are deleted via foreign key cascade

### Files:
- `backend/config.py` - Pydantic Settings configuration
- `backend/services/chat_history.py` - ChatHistoryService with `prune_old_messages()`
- `backend/main.py` - Startup pruning + background task scheduler

### Background Task:
```python
async def prune_history_periodically():
    """Runs every hour to delete expired threads."""
    while True:
        await asyncio.sleep(3600)  # 1 hour
        chat_history.prune_old_messages(settings.chat_history_retention_hours)
```

### Pruning Logic:
```python
def prune_old_messages(self, hours: int = None):
    """Deletes threads older than N hours based on updated_at."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    session.query(ChatThread).filter(ChatThread.updated_at < cutoff).delete()
    session.commit()
```

## Testing
Run the automated test:
```bash
cd backend
uv run pytest tests/test_auto_deletion.py -v
```

Or test manually:
```bash
cd backend
uv run python tests/test_auto_deletion.py
```

## Logs
Check the backend logs for pruning activity:
- Startup: `"Chat history pruned on startup."`
- Periodic: `"Periodic chat history pruning completed."`
- Errors: `"Periodic history pruning failed: {error}"`
