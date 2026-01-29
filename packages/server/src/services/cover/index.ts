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
   * Smart layout:
   * - 2 images: side by side
   * - 3 images: 1 tall (2 rows) on left + 2 stacked on right
   * - 4 images: 2x2 grid
   * - 5 images: 1 tall (2 rows) on left + 2x2 on right
   * - 6+ images: 2-column grid
   * Returns a JPEG Buffer, or null if fewer than 2 URLs or all fetches fail.
   */
  async createCompositeImage(coverUrls: string[]): Promise<Buffer | null> {
    const CELL_WIDTH = 300
    const CELL_HEIGHT = 450

    if (coverUrls.length < 2) return null

    const count = coverUrls.length
    const useSmartLayout = count === 3 || count === 5

    // Fetch all images in parallel with appropriate sizes
    const fetchResults = await Promise.allSettled(
      coverUrls.map(async (url, index) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const arrayBuffer = await response.arrayBuffer()

        // First image is tall (2 rows) for smart layout
        const isTallImage = useSmartLayout && index === 0
        const width = CELL_WIDTH
        const height = isTallImage ? CELL_HEIGHT * 2 : CELL_HEIGHT

        return {
          buffer: await sharp(Buffer.from(arrayBuffer))
            .resize(width, height, { fit: 'cover' })
            .toBuffer(),
          isTall: isTallImage,
        }
      })
    )

    const images = fetchResults
      .filter((r): r is PromiseFulfilledResult<{ buffer: Buffer; isTall: boolean }> => r.status === 'fulfilled')
      .map((r) => r.value)

    if (images.length < 2) return null

    // Recalculate if we lost images due to fetch failures
    const actualCount = images.length
    const actualSmartLayout = (actualCount === 3 || actualCount === 5) && images[0]?.isTall

    let canvasWidth: number
    let canvasHeight: number
    let compositeInputs: Array<{ input: Buffer; left: number; top: number }>

    if (actualSmartLayout) {
      // Smart layout: 1 tall image + grid on right
      // Layout for 3: [tall][2]    Layout for 5: [tall][2][3]
      //               [   ][3]                   [   ][4][5]
      const rightColCount = actualCount - 1
      // For 3 images: 1 column on right (2 stacked vertically)
      // For 5 images: 2 columns on right (2x2 grid)
      const rightCols = actualCount === 3 ? 1 : 2
      const rightRows = Math.ceil(rightColCount / rightCols)

      canvasWidth = CELL_WIDTH + rightCols * CELL_WIDTH
      canvasHeight = Math.max(2, rightRows) * CELL_HEIGHT

      compositeInputs = images.map((img, i) => {
        if (i === 0) {
          // First image: tall, on the left
          return { input: img.buffer, left: 0, top: 0 }
        } else {
          // Other images: grid on the right
          const gridIndex = i - 1
          const col = gridIndex % rightCols
          const row = Math.floor(gridIndex / rightCols)
          return {
            input: img.buffer,
            left: CELL_WIDTH + col * CELL_WIDTH,
            top: row * CELL_HEIGHT,
          }
        }
      })
    } else {
      // Standard 2-column grid
      const COLS = 2
      const rows = Math.ceil(actualCount / COLS)
      canvasWidth = COLS * CELL_WIDTH
      canvasHeight = rows * CELL_HEIGHT

      compositeInputs = images.map((img, i) => ({
        input: img.buffer,
        left: (i % COLS) * CELL_WIDTH,
        top: Math.floor(i / COLS) * CELL_HEIGHT,
      }))
    }

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

      console.log(`Created composite image: ${images.length} covers, ${canvasWidth}x${canvasHeight}, layout: ${actualSmartLayout ? 'smart' : 'grid'}`)
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
