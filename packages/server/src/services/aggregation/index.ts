import { EventEmitter } from 'events'
import { MediaEvent } from '../../types/index.js'
import { config } from '../../config.js'
import { coverService } from '../cover/index.js'
import { redirectService } from '../redirect/index.js'
import { logger } from '../logger/index.js'

interface AggregationWindow {
  items: MediaEvent[]
  timer: NodeJS.Timeout | null
  startTime: Date | null
}

type WindowKey = 'movies' | 'series' | 'movies-removed' | 'series-removed'

export interface AggregationStatus {
  movies: {
    count: number
    windowStart: Date | null
    items: MediaEvent[]
  }
  series: {
    count: number
    windowStart: Date | null
    items: MediaEvent[]
  }
  moviesRemoved: {
    count: number
    windowStart: Date | null
    items: MediaEvent[]
  }
  seriesRemoved: {
    count: number
    windowStart: Date | null
    items: MediaEvent[]
  }
  windowDurationMinutes: number
}

function createEmptyWindow(): AggregationWindow {
  return { items: [], timer: null, startTime: null }
}

/**
 * Aggregation service for batching media notifications.
 * Maintains separate windows for movies/series, added/removed.
 * Emits 'movies-ready', 'series-ready', 'movies-removed-ready',
 * and 'series-removed-ready' events when windows flush.
 */
class AggregationService extends EventEmitter {
  private movieWindow: AggregationWindow = createEmptyWindow()
  private seriesWindow: AggregationWindow = createEmptyWindow()
  private movieRemovedWindow: AggregationWindow = createEmptyWindow()
  private seriesRemovedWindow: AggregationWindow = createEmptyWindow()

  /**
   * Get the window duration in milliseconds from config.
   */
  private get windowDurationMs(): number {
    return config.aggregationWindowMinutes * 60 * 1000
  }

  /**
   * Add a media event to the appropriate aggregation window.
   * Movies go to the movie window, series/episodes go to the series window.
   * Added and removed events use separate windows.
   */
  addMedia(event: MediaEvent): void {
    const isRemoved = event.eventType === 'removed'
    if (event.type === 'movie') {
      const window = isRemoved ? this.movieRemovedWindow : this.movieWindow
      const key: WindowKey = isRemoved ? 'movies-removed' : 'movies'
      this.addToWindow(window, event, key)
    } else {
      const window = isRemoved ? this.seriesRemovedWindow : this.seriesWindow
      const key: WindowKey = isRemoved ? 'series-removed' : 'series'
      this.addToWindow(window, event, key)
    }
  }

  /**
   * Add an item to a window and start the timer if needed.
   */
  private addToWindow(window: AggregationWindow, event: MediaEvent, type: WindowKey): void {
    window.items.push(event)
    logger.info('Aggregation', `Added ${event.type} "${event.title}" to ${type} window`, { type: event.type, title: event.title, windowType: type, itemCount: window.items.length })

    if (!window.timer) {
      window.startTime = new Date()
      window.timer = setTimeout(() => this.flushWindow(window, type), this.windowDurationMs)
      logger.info('Aggregation', `Started ${type} aggregation window (${config.aggregationWindowMinutes} min)`, { windowType: type, durationMinutes: config.aggregationWindowMinutes })
    }
  }

  /**
   * Flush a window and emit the ready event with accumulated items.
   * Enhances items with high-quality covers before emitting.
   */
  private async flushWindow(window: AggregationWindow, type: WindowKey): Promise<void> {
    if (window.items.length === 0) {
      window.timer = null
      window.startTime = null
      logger.debug('Aggregation', `Skipping flush for empty ${type} window`)
      return
    }

    const items = [...window.items]
    window.items = []
    window.timer = null
    window.startTime = null

    logger.info('Aggregation', `Flushing ${type} window with ${items.length} items`, { windowType: type, itemCount: items.length, titles: items.map(i => i.title) })

    // Enhance items with high-quality covers
    const withCovers = await coverService.enhanceWithCovers(items)

    // Add redirect URLs for each item
    const enhancedItems = withCovers.map((item) => ({
      ...item,
      redirectUrl: redirectService.createRedirect(item.jellyfinId, item.title),
    }))

    this.emit(`${type}-ready`, enhancedItems)
  }

  /**
   * Manually flush all windows (for testing or shutdown).
   */
  flushAll(): void {
    const windows: [AggregationWindow, WindowKey][] = [
      [this.movieWindow, 'movies'],
      [this.seriesWindow, 'series'],
      [this.movieRemovedWindow, 'movies-removed'],
      [this.seriesRemovedWindow, 'series-removed'],
    ]
    for (const [window, key] of windows) {
      if (window.timer) {
        clearTimeout(window.timer)
        this.flushWindow(window, key)
      }
    }
  }

  /**
   * Get the current aggregation status.
   */
  getStatus(): AggregationStatus {
    return {
      movies: {
        count: this.movieWindow.items.length,
        windowStart: this.movieWindow.startTime,
        items: [...this.movieWindow.items],
      },
      series: {
        count: this.seriesWindow.items.length,
        windowStart: this.seriesWindow.startTime,
        items: [...this.seriesWindow.items],
      },
      moviesRemoved: {
        count: this.movieRemovedWindow.items.length,
        windowStart: this.movieRemovedWindow.startTime,
        items: [...this.movieRemovedWindow.items],
      },
      seriesRemoved: {
        count: this.seriesRemovedWindow.items.length,
        windowStart: this.seriesRemovedWindow.startTime,
        items: [...this.seriesRemovedWindow.items],
      },
      windowDurationMinutes: config.aggregationWindowMinutes,
    }
  }

  /**
   * Clear all windows without flushing (for testing).
   */
  clear(): void {
    const windows = [this.movieWindow, this.seriesWindow, this.movieRemovedWindow, this.seriesRemovedWindow]
    for (const window of windows) {
      if (window.timer) clearTimeout(window.timer)
    }
    this.movieWindow = createEmptyWindow()
    this.seriesWindow = createEmptyWindow()
    this.movieRemovedWindow = createEmptyWindow()
    this.seriesRemovedWindow = createEmptyWindow()
  }
}

// Singleton instance
export const aggregationService = new AggregationService()
