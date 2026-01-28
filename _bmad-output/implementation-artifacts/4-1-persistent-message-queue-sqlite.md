# Story 4.1: Persistent Message Queue with SQLite

Status: review

## Story

As a **system**,
I want **to persist pending messages in SQLite**,
so that **no notifications are lost during restarts** (FR27, NFR15).

## Acceptance Criteria

1. **Given** a notification is ready to send
   **When** WhatsApp is disconnected
   **Then** the message is saved to the `message_queue` table

2. **Given** messages are in the queue
   **When** the service restarts
   **Then** all pending messages are still in the queue

3. **Given** a message is queued
   **When** stored
   **Then** it includes: id, content, media_type, status, retry_count, created_at, updated_at

4. **Given** a message is successfully sent
   **When** delivery is confirmed
   **Then** it is removed from the queue (or marked as sent)

## Tasks / Subtasks

- [x] Task 1: Set up SQLite database with better-sqlite3
  - [x] Install better-sqlite3 dependency
  - [x] Create database initialization
  - [x] Create message_queue table schema

- [x] Task 2: Create QueueService for message persistence
  - [x] Add message to queue
  - [x] Get pending messages
  - [x] Update message status
  - [x] Remove sent messages

- [x] Task 3: Integrate queue with notification flow
  - [x] Queue messages when WhatsApp disconnected
  - [x] Send directly when connected

- [x] Task 4: Testing
  - [x] Test queue persistence across restarts
  - [x] Test message status updates

## Dev Notes

### Previous Stories Context

**Story 2.4:** WhatsApp connection status detection
**Story 3.4:** NotificationService sends messages

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS message_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  media_type TEXT NOT NULL,
  image_url TEXT,
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_queue_status ON message_queue(status);
```

### Implementation Pattern

```typescript
// packages/server/src/services/queue/index.ts

import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'queue.db')

class QueueService {
  private db: Database.Database

  constructor() {
    this.db = new Database(DB_PATH)
    this.initialize()
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        media_type TEXT NOT NULL,
        image_url TEXT,
        status TEXT DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }

  addMessage(content: string, mediaType: string, imageUrl?: string): number {
    const stmt = this.db.prepare(
      'INSERT INTO message_queue (content, media_type, image_url) VALUES (?, ?, ?)'
    )
    const result = stmt.run(content, mediaType, imageUrl || null)
    return result.lastInsertRowid as number
  }

  getPendingMessages(): QueueMessage[] {
    return this.db.prepare(
      'SELECT * FROM message_queue WHERE status = ? ORDER BY created_at'
    ).all('pending') as QueueMessage[]
  }
}
```

### References

- [Source: prd.md#FR27] - Persist pending messages
- [Source: prd.md#NFR15] - No message loss during restart
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Created QueueService singleton using better-sqlite3
- Database stored in data/queue.db
- Schema: id, content, media_type, image_url, status, retry_count, created_at, updated_at
- NotificationService now queues messages when WhatsApp disconnected
- Failed messages are also queued for retry
- Added sendQueuedMessage() method to process queued messages
- Created queue API routes: GET /api/queue, GET /api/queue/pending, DELETE /api/queue/sent, DELETE /api/queue/:id

### File List

**Created:**
- packages/server/src/services/queue/index.ts (QueueService)
- packages/server/src/routes/queue.ts (queue API endpoints)

**Modified:**
- packages/server/package.json (add better-sqlite3)
- packages/server/src/services/notification/index.ts (integrate queue)
- packages/server/src/index.ts (register queue routes)

### Change Log

- 2026-01-27: Story 4.1 implementation complete. All 4 tasks implemented.
