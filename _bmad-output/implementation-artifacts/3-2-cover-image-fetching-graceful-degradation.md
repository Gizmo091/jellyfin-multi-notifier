# Story 3.2: Cover Image Fetching with Graceful Degradation

Status: review

## Story

As a **system**,
I want **to fetch high-quality cover images from TMDB/IMDB with fallback to Jellyfin**,
so that **notifications always have visuals** (FR14, NFR10).

## Acceptance Criteria

1. **Given** media metadata with title and year
   **When** TMDB API is available
   **Then** the cover image URL is fetched from TMDB

2. **Given** TMDB API is unavailable or returns no result
   **When** fetching fails
   **Then** the system uses the Jellyfin cover URL as fallback (NFR10)

3. **Given** no cover is available from any source
   **When** generating notification
   **Then** the notification is sent as text-only without error

4. **Given** a cover URL is obtained
   **When** stored with media data
   **Then** it's available for notification formatting

## Tasks / Subtasks

- [x] Task 1: Create CoverService for image fetching
  - [x] Implement TMDB API client with API key from config
  - [x] Search by title and year for movies
  - [x] Search by series name for episodes
  - [x] Return poster URL or null

- [x] Task 2: Implement fallback chain
  - [x] Try TMDB first
  - [x] Fall back to Jellyfin cover URL if TMDB fails
  - [x] Return null if no cover available

- [x] Task 3: Integrate with aggregation flow
  - [x] Enhance MediaEvent with high-res cover before notification
  - [x] Handle async cover fetching

- [x] Task 4: Validation & Testing
  - [x] Test TMDB fetch with valid API key
  - [x] Test fallback when TMDB unavailable
  - [x] Test graceful handling when no cover found

## Dev Notes

### Previous Stories Context

**Story 1.3:** Media extraction already provides basic coverUrl from Jellyfin
**Story 3.1:** Aggregation service accumulates MediaEvents

### TMDB API

```typescript
// Search for movie
GET https://api.themoviedb.org/3/search/movie?api_key={key}&query={title}&year={year}

// Search for TV show
GET https://api.themoviedb.org/3/search/tv?api_key={key}&query={title}

// Image base URL
https://image.tmdb.org/t/p/w500{poster_path}
```

### Implementation Pattern

```typescript
// packages/server/src/services/cover/index.ts

import { config } from '../../config.js'
import { MediaEvent } from '../../types/index.js'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

interface TMDBSearchResult {
  results: Array<{
    poster_path: string | null
    id: number
  }>
}

class CoverService {
  private get apiKey(): string {
    return config.tmdbApiKey
  }

  async fetchCover(event: MediaEvent): Promise<string | null> {
    // Try TMDB first
    if (this.apiKey) {
      const tmdbCover = await this.fetchFromTMDB(event)
      if (tmdbCover) return tmdbCover
    }

    // Fallback to Jellyfin cover
    if (event.coverUrl) {
      return event.coverUrl
    }

    return null
  }

  private async fetchFromTMDB(event: MediaEvent): Promise<string | null> {
    try {
      const searchType = event.type === 'movie' ? 'movie' : 'tv'
      const query = event.type === 'episode'
        ? event.title.split(' S')[0] // Extract series name
        : event.title

      const params = new URLSearchParams({
        api_key: this.apiKey,
        query,
      })

      if (event.year && event.type === 'movie') {
        params.set('year', event.year.toString())
      }

      const response = await fetch(
        `${TMDB_BASE_URL}/search/${searchType}?${params}`
      )

      if (!response.ok) return null

      const data: TMDBSearchResult = await response.json()

      if (data.results?.[0]?.poster_path) {
        return `${TMDB_IMAGE_BASE}${data.results[0].poster_path}`
      }

      return null
    } catch (error) {
      console.error('TMDB fetch failed:', error)
      return null
    }
  }
}

export const coverService = new CoverService()
```

### Test Commands

```bash
# Test TMDB search (requires API key)
curl "https://api.themoviedb.org/3/search/movie?api_key=YOUR_KEY&query=Inception&year=2010"
```

### References

- [Source: prd.md#FR14] - Format with covers
- [Source: prd.md#NFR10] - Graceful degradation when APIs unavailable
- [TMDB API Docs](https://developers.themoviedb.org/3)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Created CoverService singleton for fetching high-quality cover images
- TMDB API integration: searches movies by title+year, TV shows by series name
- Fallback chain: TMDB → Jellyfin coverUrl → null
- Graceful degradation: API errors are logged but don't break the flow
- Episode title parsing: extracts series name from "Series S01E01 - Title" format
- Integrated with AggregationService: covers are enhanced before emitting events
- enhanceWithCovers() method fetches covers in parallel for efficiency
- TMDB_API_KEY configured in config.ts (already present)

### File List

**Created:**
- packages/server/src/services/cover/index.ts (CoverService)

**Modified:**
- packages/server/src/services/aggregation/index.ts (integrated cover enhancement)

### Change Log

- 2026-01-27: Story 3.2 implementation complete. All 4 tasks implemented and tested.
