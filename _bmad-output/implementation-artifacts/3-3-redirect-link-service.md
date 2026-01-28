# Story 3.3: Redirect Link Service

Status: review

## Story

As a **user**,
I want **to click a link in the notification and be redirected to the content in Jellyfin**,
so that **I can watch immediately** (FR15, FR16).

## Acceptance Criteria

1. **Given** media metadata with Jellyfin ID
   **When** generating a notification
   **Then** a unique redirect link is created (e.g., `/redirect/abc123`)

2. **Given** a user clicks the redirect link
   **When** the request reaches the service
   **Then** they are redirected to the Jellyfin web URL for that content

3. **Given** the redirect link is accessed from a mobile device
   **When** Jellyfin app is installed
   **Then** the deep-link opens the app directly (if supported)

4. **Given** an invalid or expired redirect ID
   **When** accessed
   **Then** a friendly error page is shown

## Tasks / Subtasks

- [x] Task 1: Create RedirectService for link management
  - [x] Generate short unique IDs for redirects
  - [x] Store mapping: shortId → jellyfinId
  - [x] Use in-memory store (SQLite in Epic 4)

- [x] Task 2: Create redirect endpoint
  - [x] GET /r/:id redirects to Jellyfin
  - [x] Build Jellyfin URL from config + jellyfinId
  - [x] Return 404 for unknown IDs

- [x] Task 3: Generate redirect URLs for media events
  - [x] Add redirectUrl field to MediaEvent
  - [x] Generate during aggregation flush

- [x] Task 4: Validation & Testing
  - [x] Test redirect with valid ID
  - [x] Test 404 for invalid ID
  - [x] Verify Jellyfin URL format

## Dev Notes

### Previous Stories Context

**Story 1.3:** MediaEvent has jellyfinId field
**Story 3.1-3.2:** Aggregation with cover enhancement

### Jellyfin URL Format

```
# Web client URL for item
{JELLYFIN_URL}/web/index.html#!/details?id={jellyfinId}

# Deep link format (mobile apps)
jellyfin://details?id={jellyfinId}
```

### Implementation Pattern

```typescript
// packages/server/src/services/redirect/index.ts

import { nanoid } from 'nanoid'
import { config } from '../../config.js'

interface RedirectEntry {
  jellyfinId: string
  title: string
  createdAt: Date
}

class RedirectService {
  private redirects: Map<string, RedirectEntry> = new Map()

  /**
   * Create a redirect link for a media item.
   */
  createRedirect(jellyfinId: string, title: string): string {
    const shortId = nanoid(8) // 8 char unique ID
    this.redirects.set(shortId, {
      jellyfinId,
      title,
      createdAt: new Date(),
    })
    return `/r/${shortId}`
  }

  /**
   * Get the Jellyfin URL for a redirect ID.
   */
  getJellyfinUrl(shortId: string): string | null {
    const entry = this.redirects.get(shortId)
    if (!entry) return null

    return `${config.jellyfinUrl}/web/index.html#!/details?id=${entry.jellyfinId}`
  }

  /**
   * Get redirect entry by ID.
   */
  getEntry(shortId: string): RedirectEntry | null {
    return this.redirects.get(shortId) || null
  }
}

export const redirectService = new RedirectService()
```

### Route Pattern

```typescript
// GET /r/:id
fastify.get('/r/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  const url = redirectService.getJellyfinUrl(id)

  if (!url) {
    return reply.code(404).send({
      success: false,
      error: 'Redirect not found or expired',
    })
  }

  return reply.redirect(302, url)
})
```

### Test Commands

```bash
# Create a redirect (internal)
# Then test redirect
curl -v http://localhost:3000/r/abc12345
```

### References

- [Source: prd.md#FR15] - Generate redirect links
- [Source: prd.md#FR16] - Redirect to Jellyfin content
- [nanoid](https://github.com/ai/nanoid) - URL-friendly unique IDs

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Created RedirectService singleton for managing redirect links
- Uses nanoid for 8-character unique short IDs
- In-memory storage with Map (will migrate to SQLite in Epic 4)
- GET /r/:id endpoint redirects to Jellyfin web client URL
- GET /api/redirects endpoint lists all stored redirects (admin)
- 404 response for unknown/expired redirect IDs
- Added redirectUrl field to MediaEvent type
- Integrated with aggregation: redirect URLs generated on window flush
- clearOldEntries() method for cleanup (24h default)

### File List

**Created:**
- packages/server/src/services/redirect/index.ts (RedirectService)
- packages/server/src/routes/redirect.ts (redirect endpoints)

**Modified:**
- packages/server/src/index.ts (registered redirect routes)
- packages/server/src/types/index.ts (added redirectUrl to MediaEvent)
- packages/server/src/services/aggregation/index.ts (generate redirects on flush)
- package.json (added nanoid dependency)

### Change Log

- 2026-01-27: Story 3.3 implementation complete. All 4 tasks implemented and tested.
