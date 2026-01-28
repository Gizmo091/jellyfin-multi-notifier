# Story 4.2: Automatic Retry with Exponential Backoff

Status: review

## Story

As a **system**,
I want **to automatically retry failed message deliveries**,
so that **temporary failures don't cause message loss** (FR28, NFR17).

## Acceptance Criteria

1. **Given** a message send fails
   **When** the failure is detected
   **Then** the message stays in queue with incremented retry_count

2. **Given** a message needs retry
   **When** the retry is scheduled
   **Then** it uses exponential backoff (e.g., 1min, 2min, 4min, 8min, 16min)

3. **Given** a message has been retried 5 times (NFR17)
   **When** all retries fail
   **Then** the message is marked as "failed" and an alert is triggered

4. **Given** retry is in progress
   **When** WhatsApp reconnects
   **Then** pending retries are processed

## Tasks / Subtasks

- [x] Task 1: Create RetryService for managing retries
  - [x] Calculate exponential backoff delay
  - [x] Schedule retry attempts
  - [x] Track retry count

- [x] Task 2: Integrate retry with queue service
  - [x] Increment retry count on failure
  - [x] Mark as failed after max retries

- [x] Task 3: Wire retry to notification flow
  - [x] Trigger retry on failed sends
  - [x] Process retries on reconnection

- [x] Task 4: Testing
  - [x] Test exponential backoff timing
  - [x] Test max retry limit

## Dev Notes

### Previous Stories Context

**Story 4.1:** QueueService with retry_count field

### Exponential Backoff Formula

```typescript
// delay = baseDelay * 2^retryCount
// Example with baseDelay = 60000ms (1 min):
// Retry 1: 1 min
// Retry 2: 2 min
// Retry 3: 4 min
// Retry 4: 8 min
// Retry 5: 16 min (max)
```

### Implementation Pattern

```typescript
class RetryService {
  private readonly MAX_RETRIES = 5
  private readonly BASE_DELAY_MS = 60000 // 1 minute
  private pendingRetries: Map<number, NodeJS.Timeout> = new Map()

  calculateDelay(retryCount: number): number {
    return this.BASE_DELAY_MS * Math.pow(2, retryCount - 1)
  }

  scheduleRetry(messageId: number, retryCount: number): void {
    const delay = this.calculateDelay(retryCount)
    const timer = setTimeout(() => this.executeRetry(messageId), delay)
    this.pendingRetries.set(messageId, timer)
  }
}
```

### References

- [Source: prd.md#FR28] - Auto-retry failed messages
- [Source: prd.md#NFR17] - Retry up to 5 times

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Created RetryService singleton with EventEmitter
- Exponential backoff: 1min, 2min, 4min, 8min, 16min (capped at 16min)
- Max 5 retries (NFR17), then message marked as 'failed'
- Listens to WhatsApp 'connected' event to process pending queue
- Processes messages with 500ms delay between each (rate limiting)
- NotificationService schedules retries on send failure
- RetryService emits 'message-failed' and 'retry-success' events

### File List

**Created:**
- packages/server/src/services/retry/index.ts (RetryService)

**Modified:**
- packages/server/src/services/notification/index.ts (integrate retry)
- packages/server/src/index.ts (initialize retry service)

### Change Log

- 2026-01-27: Story 4.2 implementation complete. All 4 tasks implemented.
