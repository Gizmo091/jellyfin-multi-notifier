import { config } from '../../config.js'
import { MediaEvent } from '../../types/index.js'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

interface TMDBSearchResult {
  results: Array<{
    poster_path: string | null
    id: number
    title?: string
    name?: string
  }>
}

/**
 * Service for fetching high-quality cover images.
 * Tries TMDB first, falls back to Jellyfin cover URL.
 */
class CoverService {
  private get apiKey(): string {
    return config.tmdbApiKey
  }

  /**
   * Fetch the best available cover image for a media event.
   * Priority: TMDB > Jellyfin > null
   */
  async fetchCover(event: MediaEvent): Promise<string | null> {
    // Try TMDB first if API key is configured
    if (this.apiKey) {
      const tmdbCover = await this.fetchFromTMDB(event)
      if (tmdbCover) {
        console.log(`TMDB cover found for "${event.title}": ${tmdbCover}`)
        return tmdbCover
      }
    }

    // Fallback to Jellyfin cover
    if (event.coverUrl) {
      console.log(`Using Jellyfin cover for "${event.title}": ${event.coverUrl}`)
      return event.coverUrl
    }

    console.log(`No cover found for "${event.title}"`)
    return null
  }

  /**
   * Fetch cover image from TMDB API.
   */
  private async fetchFromTMDB(event: MediaEvent): Promise<string | null> {
    try {
      const searchType = event.type === 'movie' ? 'movie' : 'tv'

      // For episodes, extract series name (before "S01E01" pattern)
      let query = event.title
      if (event.type === 'episode') {
        // Try to extract series name from title like "Series Name S01E01 - Episode Title"
        const seriesMatch = event.title.match(/^(.+?)\s+S\d+E\d+/)
        if (seriesMatch) {
          query = seriesMatch[1].trim()
        }
      }

      const params = new URLSearchParams({
        api_key: this.apiKey,
        query,
      })

      // Add year for movies to improve accuracy
      if (event.year && event.type === 'movie') {
        params.set('year', event.year.toString())
      }

      const url = `${TMDB_BASE_URL}/search/${searchType}?${params}`
      const response = await fetch(url)

      if (!response.ok) {
        console.warn(`TMDB API error: ${response.status} ${response.statusText}`)
        return null
      }

      const data = (await response.json()) as TMDBSearchResult

      if (data.results?.length > 0 && data.results[0].poster_path) {
        return `${TMDB_IMAGE_BASE}${data.results[0].poster_path}`
      }

      console.log(`No TMDB results for "${query}"`)
      return null
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`TMDB fetch failed for "${event.title}":`, errorMessage)
      return null
    }
  }

  /**
   * Enhance a list of media events with high-quality covers.
   * Fetches covers in parallel for efficiency.
   */
  async enhanceWithCovers(events: MediaEvent[]): Promise<MediaEvent[]> {
    const enhanced = await Promise.all(
      events.map(async (event) => {
        const coverUrl = await this.fetchCover(event)
        return {
          ...event,
          coverUrl: coverUrl || event.coverUrl,
        }
      })
    )
    return enhanced
  }
}

// Singleton instance
export const coverService = new CoverService()
