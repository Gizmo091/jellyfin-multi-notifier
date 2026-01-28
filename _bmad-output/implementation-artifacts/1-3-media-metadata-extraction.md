# Story 1.3: Media Metadata Extraction

Status: review

## Story

As a **system**,
I want **to extract media metadata from Jellyfin webhook payloads**,
so that **I have all the information needed for notifications** (FR1, FR2, FR4).

## Acceptance Criteria

1. **Given** a valid webhook for media addition (FR1)
   **When** the payload is parsed
   **Then** the system extracts: title, year, type (movie/series/episode), cover URL, Jellyfin ID

2. **Given** a valid webhook for media deletion (FR2)
   **When** the payload is parsed
   **Then** the system extracts the same metadata fields

3. **Given** a webhook with incomplete data
   **When** parsed
   **Then** missing fields are handled gracefully with defaults or logged warnings

4. **Given** extracted metadata
   **When** stored temporarily
   **Then** it is available for the aggregation system (prepared for Epic 3)

## Tasks / Subtasks

- [x] Task 1: Create media extraction service (AC: #1, #2, #3)
  - [x] Create `packages/server/src/services/media-extractor.ts`
  - [x] Implement `extractMediaEvent()` function
  - [x] Handle NotificationType mapping (ItemAdded → added, ItemRemoved → removed)
  - [x] Map Jellyfin types to MediaType enum (Movie → movie, Series → series, Episode → episode)
  - [x] Handle missing fields with defaults and log warnings

- [x] Task 2: Build Jellyfin cover URL (AC: #1, #2)
  - [x] Implement `buildCoverUrl()` helper function
  - [x] Use ImageTags from JellyfinItem to construct URL
  - [x] Use `config.jellyfinUrl` as base URL
  - [x] Handle missing image tags gracefully

- [x] Task 3: Integrate extraction in webhook handler (AC: #1, #2)
  - [x] Import media extractor in `routes/webhook.ts`
  - [x] Call `extractMediaEvent()` for each valid webhook
  - [x] Log extracted metadata for debugging
  - [x] Return extracted data in response (for now)

- [x] Task 4: Prepare storage interface for aggregation (AC: #4)
  - [x] Define `MediaEventStore` interface in types
  - [x] Create in-memory store placeholder in `services/media-store.ts`
  - [x] Implement `addEvent()` and `getEvents()` methods
  - [x] Prepare for Epic 3 aggregation integration

- [x] Task 5: Validation & Testing (AC: #1-4)
  - [x] Test with ItemAdded webhook → extracted movie metadata
  - [x] Test with ItemRemoved webhook → extracted series metadata
  - [x] Test with incomplete payload → graceful defaults
  - [x] Verify all extracted fields are correct

## Dev Notes

### Previous Stories Context

**Story 1.1:** Project scaffolding complete with Fastify server
**Story 1.2:** Webhook endpoint `/webhook/jellyfin` with secret validation

Current webhook handler (from story 1.2) just acknowledges receipt:
```typescript
fastify.post('/webhook/jellyfin', async (request, reply) => {
  fastify.log.info({ msg: 'Webhook received from Jellyfin', notificationType: request.body?.NotificationType })
  return { success: true, data: { received: true, timestamp: new Date().toISOString() } }
})
```

### Jellyfin Webhook Payload Structure

```typescript
// NotificationType values:
// - "ItemAdded" - New media added
// - "ItemRemoved" - Media deleted
// - "PlaybackStart", "PlaybackStop" - Playback events (ignore for now)

interface JellyfinWebhookPayload {
  NotificationType?: string
  ServerId?: string
  ServerName?: string
  ServerUrl?: string
  Item?: JellyfinItem
  User?: JellyfinUser
}

interface JellyfinItem {
  Id?: string              // Jellyfin ID
  Name?: string            // Title
  Type?: string            // "Movie", "Series", "Episode"
  ProductionYear?: number  // Year
  SeriesName?: string      // For episodes
  SeasonName?: string      // For episodes
  IndexNumber?: number     // Episode number
  ParentIndexNumber?: number  // Season number
  ImageTags?: Record<string, string>  // { "Primary": "abc123" }
}
```

### MediaEvent Output Structure

```typescript
interface MediaEvent {
  id: string                          // Generated UUID
  type: 'movie' | 'series' | 'episode'
  title: string                       // Formatted title
  year?: number
  coverUrl?: string                   // Jellyfin cover URL
  jellyfinId: string                  // Item.Id
  eventType: 'added' | 'removed'
  timestamp: Date
}
```

### Implementation Pattern: Media Extractor

```typescript
// packages/server/src/services/media-extractor.ts
import { randomUUID } from 'crypto'
import { config } from '../config.js'
import type { JellyfinWebhookPayload, JellyfinItem, MediaEvent, MediaType } from '../types/index.js'

export function extractMediaEvent(payload: JellyfinWebhookPayload): MediaEvent | null {
  const { NotificationType, Item } = payload

  // Only process ItemAdded and ItemRemoved
  if (!NotificationType || !['ItemAdded', 'ItemRemoved'].includes(NotificationType)) {
    return null
  }

  if (!Item) {
    return null
  }

  const eventType = NotificationType === 'ItemAdded' ? 'added' : 'removed'
  const type = mapJellyfinType(Item.Type)
  const title = formatTitle(Item)
  const coverUrl = buildCoverUrl(Item)

  return {
    id: randomUUID(),
    type,
    title,
    year: Item.ProductionYear,
    coverUrl,
    jellyfinId: Item.Id ?? 'unknown',
    eventType,
    timestamp: new Date(),
  }
}

function mapJellyfinType(jellyfinType?: string): MediaType {
  switch (jellyfinType?.toLowerCase()) {
    case 'movie': return 'movie'
    case 'series': return 'series'
    case 'episode': return 'episode'
    default: return 'movie' // Default fallback
  }
}

function formatTitle(item: JellyfinItem): string {
  if (item.Type === 'Episode' && item.SeriesName) {
    // Format: "Series Name S01E02 - Episode Name"
    const season = item.ParentIndexNumber?.toString().padStart(2, '0') ?? '??'
    const episode = item.IndexNumber?.toString().padStart(2, '0') ?? '??'
    return `${item.SeriesName} S${season}E${episode}${item.Name ? ` - ${item.Name}` : ''}`
  }
  return item.Name ?? 'Unknown'
}

function buildCoverUrl(item: JellyfinItem): string | undefined {
  if (!item.Id || !item.ImageTags?.Primary) {
    return undefined
  }
  // Jellyfin cover URL format: /Items/{id}/Images/Primary
  return `${config.jellyfinUrl}/Items/${item.Id}/Images/Primary`
}
```

### In-Memory Store Pattern

```typescript
// packages/server/src/services/media-store.ts
import type { MediaEvent } from '../types/index.js'

const events: MediaEvent[] = []

export const mediaStore = {
  addEvent(event: MediaEvent): void {
    events.push(event)
  },

  getEvents(): MediaEvent[] {
    return [...events]
  },

  clearEvents(): void {
    events.length = 0
  },
}
```

### NotificationType Mapping

| Jellyfin NotificationType | eventType | Action |
|---------------------------|-----------|--------|
| ItemAdded | added | Extract and store |
| ItemRemoved | removed | Extract and store |
| PlaybackStart | - | Ignore |
| PlaybackStop | - | Ignore |
| Other | - | Ignore |

### Cover URL Construction

```
Base: {JELLYFIN_URL}/Items/{Item.Id}/Images/Primary
Example: http://jellyfin:8096/Items/abc123/Images/Primary
```

### Test Commands

```bash
# Test ItemAdded with Movie
WEBHOOK_SECRET="test-secret" curl -X POST http://localhost:3000/webhook/jellyfin \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: test-secret" \
  -d '{
    "NotificationType": "ItemAdded",
    "Item": {
      "Id": "abc123",
      "Name": "The Matrix",
      "Type": "Movie",
      "ProductionYear": 1999,
      "ImageTags": {"Primary": "tag123"}
    }
  }'

# Test ItemRemoved with Series
WEBHOOK_SECRET="test-secret" curl -X POST http://localhost:3000/webhook/jellyfin \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: test-secret" \
  -d '{
    "NotificationType": "ItemRemoved",
    "Item": {
      "Id": "def456",
      "Name": "Breaking Bad",
      "Type": "Series",
      "ProductionYear": 2008
    }
  }'

# Test Episode format
WEBHOOK_SECRET="test-secret" curl -X POST http://localhost:3000/webhook/jellyfin \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: test-secret" \
  -d '{
    "NotificationType": "ItemAdded",
    "Item": {
      "Id": "ep789",
      "Name": "Pilot",
      "Type": "Episode",
      "SeriesName": "Breaking Bad",
      "ParentIndexNumber": 1,
      "IndexNumber": 1,
      "ProductionYear": 2008
    }
  }'
```

### References

- [Source: architecture.md#FR Coverage] - FR1, FR2, FR4
- [Source: prd.md#FR1] - Receive webhook for media additions
- [Source: prd.md#FR2] - Receive webhook for media deletions
- [Source: prd.md#FR4] - Extract media metadata from webhook payload
- [Source: types/index.ts] - JellyfinWebhookPayload, JellyfinItem, MediaEvent types

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Created media extraction service with `extractMediaEvent()` function
- Implemented `buildCoverUrl()` helper that constructs Jellyfin image URLs
- Episode titles formatted as "Series S01E01 - Episode Name"
- NotificationType mapping: ItemAdded → added, ItemRemoved → removed
- Unknown types default to 'movie' with console warning
- Missing fields handled gracefully (undefined coverUrl, 'unknown' jellyfinId)
- Created in-memory MediaEventStore with interface for future Epic 4 SQLite migration
- Integrated extraction into webhook handler with logging
- Response now includes extracted event data for debugging
- All tests pass:
  - ItemAdded Movie → extracted with coverUrl
  - ItemRemoved Series → extracted without coverUrl (no ImageTags)
  - Episode → formatted title "Breaking Bad S01E01 - Pilot"
  - Incomplete payload → graceful defaults
  - PlaybackStart → event: null (ignored)

### File List

**Created:**
- packages/server/src/services/media-extractor.ts
- packages/server/src/services/media-store.ts

**Modified:**
- packages/server/src/routes/webhook.ts (integrated extraction and storage)

### Change Log

- 2026-01-27: Story 1.3 implementation complete. All 5 tasks implemented and tested.
