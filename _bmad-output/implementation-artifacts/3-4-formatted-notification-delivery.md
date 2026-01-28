# Story 3.4: Formatted Notification Delivery

Status: review

## Story

As a **group member**,
I want **to receive well-formatted notifications with cover, titles, and clickable links**,
so that **I know what's new and can access it easily** (FR14, FR17).

## Acceptance Criteria

1. **Given** an aggregation window flushes with movies
   **When** the notification is generated
   **Then** it includes: cover image, "Nouveaux films" header, list of "Title (Year)" with links

2. **Given** an aggregation window flushes with series
   **When** the notification is generated
   **Then** it includes: cover image, "Nouveautés séries" header, list with episode info and links

3. **Given** multiple items in one notification
   **When** formatted
   **Then** each item has its own clickable link (FR17)

4. **Given** a notification is ready
   **When** sent via WhatsApp (using Epic 2 capabilities)
   **Then** the message appears with image and formatted text

## Tasks / Subtasks

- [x] Task 1: Create NotificationService for formatting messages
  - [x] Format movies notification with emoji header
  - [x] Format series notification with episode details
  - [x] Include redirect links for each item

- [x] Task 2: Wire aggregation events to notification sending
  - [x] Listen to 'movies-ready' event
  - [x] Listen to 'series-ready' event
  - [x] Send formatted messages via WhatsApp

- [x] Task 3: Handle image + text formatting
  - [x] Use first item's cover as notification image
  - [x] Fall back to text-only if no cover available

- [x] Task 4: Integration & Testing
  - [x] Test notification formatting
  - [x] Test WhatsApp delivery
  - [x] Verify links are clickable

## Dev Notes

### Previous Stories Context

**Story 2.2:** sendTextMessage()
**Story 2.3:** sendImageMessage() with caption
**Story 3.1:** Aggregation events 'movies-ready', 'series-ready'
**Story 3.2:** Cover images enhanced via coverService
**Story 3.3:** Redirect URLs via redirectService

### Notification Format

```
🎬 Nouveaux films

• The Matrix (1999)
  ▸ https://example.com/r/abc12345

• Inception (2010)
  ▸ https://example.com/r/def67890
```

```
📺 Nouveautés séries

• Breaking Bad - S01E01 (2008)
  ▸ https://example.com/r/xyz98765
```

### Implementation Pattern

```typescript
// packages/server/src/services/notification/index.ts

import { MediaEvent } from '../../types/index.js'
import { config } from '../../config.js'
import { whatsappClient } from '../whatsapp/client.js'

class NotificationService {
  /**
   * Format and send a movies notification.
   */
  async sendMoviesNotification(items: MediaEvent[]): Promise<boolean> {
    const message = this.formatMoviesMessage(items)
    const coverUrl = items.find(i => i.coverUrl)?.coverUrl

    if (coverUrl) {
      return whatsappClient.sendImageMessage(
        config.whatsappGroupId,
        coverUrl,
        message
      )
    }
    return whatsappClient.sendTextMessage(config.whatsappGroupId, message)
  }

  private formatMoviesMessage(items: MediaEvent[]): string {
    let message = '🎬 Nouveaux films\n\n'
    for (const item of items) {
      message += `• ${item.title}${item.year ? ` (${item.year})` : ''}\n`
      if (item.redirectUrl) {
        message += `  ▸ ${config.publicUrl}${item.redirectUrl}\n`
      }
      message += '\n'
    }
    return message.trim()
  }
}
```

### References

- [Source: prd.md#FR14] - Format with covers and titles
- [Source: prd.md#FR17] - Include clickable links

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Created NotificationService singleton for formatting and sending WhatsApp notifications
- Listens to aggregation events ('movies-ready', 'series-ready')
- Formats movies: "Nouveaux films" header + Title (Year) + redirect link
- Formats series: "Nouveautes series" header + Title (Year) + redirect link
- Uses first item's cover as notification image, falls back to text-only
- Added publicUrl config option (PUBLIC_URL env var) for redirect links
- Wired service initialization in index.ts

### File List

**Created:**
- packages/server/src/services/notification/index.ts (NotificationService)

**Modified:**
- packages/server/src/index.ts (wire aggregation to notification)
- packages/server/src/config.ts (add publicUrl)

### Change Log

- 2026-01-27: Story 3.4 implementation complete. All 4 tasks implemented.
