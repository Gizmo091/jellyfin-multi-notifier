import sharp from 'sharp'
import { config } from '../../config.js'
import { MediaEvent, SupportedLanguage } from '../../types/index.js'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

// Map our supported languages to TMDB language codes
const TMDB_LANGUAGE_MAP: Record<SupportedLanguage, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-BR',
}

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
   * @param event The media event
   * @param language Optional language for TMDB search (improves search accuracy and may return localized posters)
   */
  async fetchCover(event: MediaEvent, language?: SupportedLanguage): Promise<string | null> {
    // Try TMDB first if API key is configured
    if (this.apiKey) {
      const tmdbCover = await this.fetchFromTMDB(event, language)
      if (tmdbCover) {
        console.log(`TMDB cover found for "${event.title}" (lang: ${language || 'default'}): ${tmdbCover}`)
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
   * @param event The media event
   * @param language Optional language for search (affects results and may return localized posters)
   */
  private async fetchFromTMDB(event: MediaEvent, language?: SupportedLanguage): Promise<string | null> {
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

      // Add language parameter if specified
      if (language) {
        params.set('language', TMDB_LANGUAGE_MAP[language])
      }

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

      console.log(`No TMDB results for "${query}" (lang: ${language || 'default'})`)
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
   * @param events The media events to enhance
   * @param language Optional language for TMDB search
   */
  async enhanceWithCovers(events: MediaEvent[], language?: SupportedLanguage): Promise<MediaEvent[]> {
    const enhanced = await Promise.all(
      events.map(async (event) => {
        const coverUrl = await this.fetchCover(event, language)
        return {
          ...event,
          coverUrl: coverUrl || event.coverUrl,
        }
      })
    )
    return enhanced
  }

  /**
   * Create a composite patchwork image from multiple cover URLs.
   * Layout: 2 columns, 1-2 rows (max 4 images). Each cell is 300x450.
   * Returns a JPEG Buffer, or null if fewer than 2 URLs or all fetches fail.
   */
  async createCompositeImage(coverUrls: string[]): Promise<Buffer | null> {
    const CELL_WIDTH = 300
    const CELL_HEIGHT = 450
    const COLS = 2
    const urls = coverUrls.slice(0, 4)

    if (urls.length < 2) return null

    // Fetch all images in parallel
    const fetchResults = await Promise.allSettled(
      urls.map(async (url) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const arrayBuffer = await response.arrayBuffer()
        return sharp(Buffer.from(arrayBuffer))
          .resize(CELL_WIDTH, CELL_HEIGHT, { fit: 'cover' })
          .toBuffer()
      })
    )

    const buffers = fetchResults
      .filter((r): r is PromiseFulfilledResult<Buffer> => r.status === 'fulfilled')
      .map((r) => r.value)

    if (buffers.length < 2) return null

    const rows = Math.ceil(buffers.length / COLS)
    const canvasWidth = COLS * CELL_WIDTH
    const canvasHeight = rows * CELL_HEIGHT

    const compositeInputs = buffers.map((buf, i) => ({
      input: buf,
      left: (i % COLS) * CELL_WIDTH,
      top: Math.floor(i / COLS) * CELL_HEIGHT,
    }))

    try {
      const result = await sharp({
        create: {
          width: canvasWidth,
          height: canvasHeight,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .composite(compositeInputs)
        .jpeg({ quality: 85 })
        .toBuffer()

      console.log(`Created composite image: ${buffers.length} covers, ${canvasWidth}x${canvasHeight}`)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Failed to create composite image:', errorMessage)
      return null
    }
  }
}

// Singleton instance
export const coverService = new CoverService()
