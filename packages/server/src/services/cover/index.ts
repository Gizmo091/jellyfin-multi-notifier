import sharp from 'sharp'
import { config } from '../../config.js'
import { MediaEvent, SupportedLanguage } from '../../types/index.js'
import { logger } from '../logger/index.js'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

// Maximum concurrent image fetches to avoid network/memory saturation
const MAX_CONCURRENT_FETCHES = 5

/**
 * Execute promises with a concurrency limit.
 * Returns results in the same order as input.
 */
async function promiseAllWithLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let currentIndex = 0

  async function runNext(): Promise<void> {
    while (currentIndex < tasks.length) {
      const index = currentIndex++
      try {
        const value = await tasks[index]()
        results[index] = { status: 'fulfilled', value }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  // Start up to 'limit' concurrent workers
  const workers = Array(Math.min(limit, tasks.length))
    .fill(null)
    .map(() => runNext())

  await Promise.all(workers)
  return results
}

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
        logger.debug('Cover', `TMDB cover found for "${event.title}"`, { language: language || 'default' })
        return tmdbCover
      }
    }

    // Fallback to Jellyfin cover
    if (event.coverUrl) {
      logger.debug('Cover', `Using Jellyfin cover for "${event.title}"`)
      return event.coverUrl
    }

    logger.debug('Cover', `No cover found for "${event.title}"`)
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
        logger.warn('Cover', `TMDB API error: ${response.status} ${response.statusText}`)
        return null
      }

      const data = (await response.json()) as TMDBSearchResult

      if (data.results?.length > 0 && data.results[0].poster_path) {
        return `${TMDB_IMAGE_BASE}${data.results[0].poster_path}`
      }

      logger.debug('Cover', `No TMDB results for "${query}"`, { language: language || 'default' })
      return null
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Cover', `TMDB fetch failed for "${event.title}"`, { error: errorMessage })
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
   * Determine the optimal layout for a given number of images.
   * Rules:
   * 1. Perfect square (4, 9, 16...) → square grid (2x2, 3x3, 4x4...)
   * 2. Odd number (3, 5, 7, 11...) → 1 tall image + columns of 2
   * 3. Otherwise → best ratio to be as square as possible
   */
  private getLayout(count: number): { cols: number; rows: number; useSmartLayout: boolean } {
    // Rule 1: Perfect square → square grid
    const sqrt = Math.sqrt(count)
    if (Number.isInteger(sqrt)) {
      return { cols: sqrt, rows: sqrt, useSmartLayout: false }
    }

    // Rule 2: Odd number → 1 tall image + (n-1)/2 columns of 2 rows
    if (count % 2 === 1) {
      const rightCols = (count - 1) / 2
      return { cols: 1 + rightCols, rows: 2, useSmartLayout: true }
    }

    // Rule 3: Even (not perfect square) → find best ratio (closest to square, prefer wider)
    let bestCols = count
    let bestRows = 1
    for (let i = 2; i <= Math.sqrt(count); i++) {
      if (count % i === 0) {
        const cols = count / i
        const rows = i
        if (Math.abs(cols - rows) < Math.abs(bestCols - bestRows)) {
          bestCols = cols
          bestRows = rows
        }
      }
    }
    // Ensure wider than taller
    if (bestRows > bestCols) {
      [bestCols, bestRows] = [bestRows, bestCols]
    }
    return { cols: bestCols, rows: bestRows, useSmartLayout: false }
  }

  /**
   * Create a composite patchwork image from multiple cover URLs.
   * Returns a JPEG Buffer, or null if fewer than 2 URLs or all fetches fail.
   */
  async createCompositeImage(coverUrls: string[]): Promise<Buffer | null> {
    const CELL_WIDTH = 300
    const CELL_HEIGHT = 450

    if (coverUrls.length < 2) return null

    const count = coverUrls.length
    const layout = this.getLayout(count)

    // Fetch images with concurrency limit to avoid network/memory saturation
    const fetchTasks = coverUrls.map((url, index) => async () => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const arrayBuffer = await response.arrayBuffer()

      // First image is tall (2 rows) for smart layout
      const isTallImage = layout.useSmartLayout && index === 0
      const width = CELL_WIDTH
      const height = isTallImage ? CELL_HEIGHT * 2 : CELL_HEIGHT

      return {
        buffer: await sharp(Buffer.from(arrayBuffer))
          .resize(width, height, { fit: 'cover' })
          .toBuffer(),
        isTall: isTallImage,
      }
    })

    const fetchResults = await promiseAllWithLimit(fetchTasks, MAX_CONCURRENT_FETCHES)

    const images = fetchResults
      .filter((r): r is PromiseFulfilledResult<{ buffer: Buffer; isTall: boolean }> => r.status === 'fulfilled')
      .map((r) => r.value)

    if (images.length < 2) return null

    // Recalculate layout if we lost images due to fetch failures
    const actualCount = images.length
    const actualLayout = this.getLayout(actualCount)
    const actualSmartLayout = actualLayout.useSmartLayout && images[0]?.isTall

    let canvasWidth: number
    let canvasHeight: number
    let compositeInputs: Array<{ input: Buffer; left: number; top: number }>

    if (actualSmartLayout) {
      // Smart layout: 1 tall image on left + grid of small images on right
      const rightCols = (actualCount - 1) / 2
      canvasWidth = CELL_WIDTH + rightCols * CELL_WIDTH
      canvasHeight = 2 * CELL_HEIGHT

      compositeInputs = images.map((img, i) => {
        if (i === 0) {
          // First image: tall, on the left
          return { input: img.buffer, left: 0, top: 0 }
        } else {
          // Other images: grid on the right (2 rows)
          const gridIndex = i - 1
          const col = Math.floor(gridIndex / 2)
          const row = gridIndex % 2
          return {
            input: img.buffer,
            left: CELL_WIDTH + col * CELL_WIDTH,
            top: row * CELL_HEIGHT,
          }
        }
      })
    } else {
      // Standard grid layout
      const { cols, rows } = actualLayout
      canvasWidth = cols * CELL_WIDTH
      canvasHeight = rows * CELL_HEIGHT

      compositeInputs = images.map((img, i) => ({
        input: img.buffer,
        left: (i % cols) * CELL_WIDTH,
        top: Math.floor(i / cols) * CELL_HEIGHT,
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

      logger.debug('Cover', `Created composite image: ${images.length} covers, ${canvasWidth}x${canvasHeight}`, { layout: actualSmartLayout ? 'smart' : `${actualLayout.cols}x${actualLayout.rows}` })
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Cover', 'Failed to create composite image', { error: errorMessage })
      return null
    }
  }
}

// Singleton instance
export const coverService = new CoverService()
