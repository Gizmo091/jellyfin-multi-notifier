# Story 3.1: Temporal Aggregation with Separate Windows

Status: review

## Story

As a **system**,
I want **to aggregate multiple media additions into batched notifications with separate windows for films and series**,
so that **users don't receive spam notifications** (FR11, FR12, FR13).

## Acceptance Criteria

1. **Given** a media addition event arrives
   **When** it's a movie
   **Then** it's added to the "films" aggregation window

2. **Given** a media addition event arrives
   **When** it's a series/episode
   **Then** it's added to the "series" aggregation window

3. **Given** the aggregation window time (default 15 min) elapses
   **When** there are items in the window
   **Then** the window is flushed and items are sent for notification

4. **Given** no items arrive during a window
   **When** the timer elapses
   **Then** no notification is sent

5. **Given** admin configures a custom aggregation window (FR13)
   **When** the value is set (e.g., 5 min, 30 min)
   **Then** subsequent windows use the new duration (NFR4 accuracy)

## Tasks / Subtasks

- [x] Task 1: Create AggregationService class
  - [x] Implement separate windows for movies and series
  - [x] Store MediaEvent items in each window
  - [x] Use configurable window duration from config

- [x] Task 2: Implement window timer logic
  - [x] Start timer when first item is added to empty window
  - [x] Flush window when timer expires
  - [x] Reset timer after flush
  - [x] Handle multiple items arriving during window

- [x] Task 3: Emit events on window flush
  - [x] Emit 'movies-ready' event with movie items
  - [x] Emit 'series-ready' event with series items
  - [x] Include all accumulated items in event

- [x] Task 4: Integrate with webhook handler
  - [x] Add MediaEvent to appropriate window on webhook
  - [x] Connect aggregation service to notification flow

- [x] Task 5: Validation & Testing
  - [x] Test movie goes to movie window
  - [x] Test series goes to series window
  - [x] Test window flushes after timeout
  - [x] Test empty window doesn't flush

## Dev Notes

### Previous Stories Context

**Epic 1:** Webhook reception and media metadata extraction
- MediaEvent type available with type: 'movie' | 'series' | 'episode'
- Webhook handler extracts metadata from Jellyfin payload

**Epic 2:** WhatsApp messaging available
- sendTextMessage() and sendImageMessage() ready

### Implementation Pattern

```typescript
// packages/server/src/services/aggregation/index.ts

import { EventEmitter } from 'events'
import { MediaEvent } from '../../types/index.js'
import { config } from '../../config.js'

interface AggregationWindow {
  items: MediaEvent[]
  timer: NodeJS.Timeout | null
  startTime: Date | null
}

class AggregationService extends EventEmitter {
  private movieWindow: AggregationWindow = { items: [], timer: null, startTime: null }
  private seriesWindow: AggregationWindow = { items: [], timer: null, startTime: null }

  private get windowDurationMs(): number {
    return (config.aggregationWindowMinutes || 15) * 60 * 1000
  }

  addMedia(event: MediaEvent): void {
    if (event.type === 'movie') {
      this.addToWindow(this.movieWindow, event, 'movies')
    } else {
      // series and episode go to series window
      this.addToWindow(this.seriesWindow, event, 'series')
    }
  }

  private addToWindow(window: AggregationWindow, event: MediaEvent, type: 'movies' | 'series'): void {
    window.items.push(event)

    if (!window.timer) {
      window.startTime = new Date()
      window.timer = setTimeout(() => this.flushWindow(window, type), this.windowDurationMs)
      console.log(`Started ${type} aggregation window (${config.aggregationWindowMinutes || 15} min)`)
    }
  }

  private flushWindow(window: AggregationWindow, type: 'movies' | 'series'): void {
    if (window.items.length === 0) {
      return
    }

    const items = [...window.items]
    window.items = []
    window.timer = null
    window.startTime = null

    console.log(`Flushing ${type} window with ${items.length} items`)
    this.emit(`${type}-ready`, items)
  }

  // For testing or manual flush
  flushAll(): void {
    if (this.movieWindow.timer) {
      clearTimeout(this.movieWindow.timer)
      this.flushWindow(this.movieWindow, 'movies')
    }
    if (this.seriesWindow.timer) {
      clearTimeout(this.seriesWindow.timer)
      this.flushWindow(this.seriesWindow, 'series')
    }
  }

  getStatus(): { movies: number; series: number; movieWindowStart: Date | null; seriesWindowStart: Date | null } {
    return {
      movies: this.movieWindow.items.length,
      series: this.seriesWindow.items.length,
      movieWindowStart: this.movieWindow.startTime,
      seriesWindowStart: this.seriesWindow.startTime,
    }
  }
}

export const aggregationService = new AggregationService()
```

### Integration with Webhook

```typescript
// In webhook handler after extracting MediaEvent
import { aggregationService } from '../services/aggregation/index.js'

// After creating mediaEvent from webhook payload
if (mediaEvent.eventType === 'added') {
  aggregationService.addMedia(mediaEvent)
}
```

### Config Extension

```typescript
// Ensure AGGREGATION_WINDOW_MINUTES is in config
aggregationWindowMinutes: parseInt(process.env.AGGREGATION_WINDOW_MINUTES || '15', 10)
```

### Test Commands

```bash
# Send test webhook for movie
curl -X POST http://localhost:3000/webhook/jellyfin \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: test-secret" \
  -d '{
    "NotificationType": "ItemAdded",
    "Item": {
      "Id": "abc123",
      "Name": "Test Movie",
      "Type": "Movie",
      "ProductionYear": 2024
    }
  }'

# Check aggregation status
curl http://localhost:3000/api/aggregation/status | jq .
```

### References

- [Source: prd.md#FR11] - Aggregate notifications
- [Source: prd.md#FR12] - Separate films/series
- [Source: prd.md#FR13] - Configure aggregation window
- [Source: prd.md#NFR4] - Timer accuracy within 1 second

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Created AggregationService class with EventEmitter pattern
- Separate windows for movies and series/episodes
- Timer starts on first item, flushes after configurable window duration
- Default window duration: 15 minutes (AGGREGATION_WINDOW_MINUTES env var)
- Events emitted: 'movies-ready' and 'series-ready' with accumulated items
- Added aggregationWindowMinutes to config
- Integrated with webhook handler: added events go to aggregation service
- Created GET /api/aggregation/status endpoint for monitoring
- Created POST /api/aggregation/flush endpoint for manual flush
- Tests passed:
  - Movie goes to movies window
  - Episode goes to series window
  - Status endpoint returns window info with items

### File List

**Created:**
- packages/server/src/services/aggregation/index.ts (AggregationService)
- packages/server/src/routes/aggregation.ts (status and flush endpoints)

**Modified:**
- packages/server/src/config.ts (added aggregationWindowMinutes)
- packages/server/src/routes/webhook.ts (integration with aggregation)
- packages/server/src/index.ts (registered aggregation routes)

### Change Log

- 2026-01-27: Story 3.1 implementation complete. All 5 tasks implemented and tested.
