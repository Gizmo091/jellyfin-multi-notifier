import { EventEmitter } from 'events'
import { MediaEvent } from '../../types/index.js'
import { config } from '../../config.js'
import { coverService } from '../cover/index.js'

interface AggregationWindow {
  items: MediaEvent[]
  timer: NodeJS.Timeout | null
  startTime: Date | null
}

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
  windowDurationMinutes: number
}

/**
 * Aggregation service for batching media notifications.
 * Maintains separate windows for movies and series.
 * Emits 'movies-ready' and 'series-ready' events when windows flush.
 */
class AggregationService extends EventEmitter {
  private movieWindow: AggregationWindow = { items: [], timer: null, startTime: null }
  private seriesWindow: AggregationWindow = { items: [], timer: null, startTime: null }

  /**
   * Get the window duration in milliseconds from config.
   */
  private get windowDurationMs(): number {
    return config.aggregationWindowMinutes * 60 * 1000
  }

  /**
   * Add a media event to the appropriate aggregation window.
   * Movies go to the movie window, series/episodes go to the series window.
   */
  addMedia(event: MediaEvent): void {
    if (event.type === 'movie') {
      this.addToWindow(this.movieWindow, event, 'movies')
    } else {
      // series and episode go to series window
      this.addToWindow(this.seriesWindow, event, 'series')
    }
  }

  /**
   * Add an item to a window and start the timer if needed.
   */
  private addToWindow(window: AggregationWindow, event: MediaEvent, type: 'movies' | 'series'): void {
    window.items.push(event)
    console.log(`Added ${event.type} "${event.title}" to ${type} window (${window.items.length} items)`)

    if (!window.timer) {
      window.startTime = new Date()
      window.timer = setTimeout(() => this.flushWindow(window, type), this.windowDurationMs)
      console.log(`Started ${type} aggregation window (${config.aggregationWindowMinutes} min)`)
    }
  }

  /**
   * Flush a window and emit the ready event with accumulated items.
   * Enhances items with high-quality covers before emitting.
   */
  private async flushWindow(window: AggregationWindow, type: 'movies' | 'series'): Promise<void> {
    if (window.items.length === 0) {
      window.timer = null
      window.startTime = null
      return
    }

    const items = [...window.items]
    window.items = []
    window.timer = null
    window.startTime = null

    console.log(`Flushing ${type} window with ${items.length} items`)

    // Enhance items with high-quality covers
    const enhancedItems = await coverService.enhanceWithCovers(items)

    this.emit(`${type}-ready`, enhancedItems)
  }

  /**
   * Manually flush all windows (for testing or shutdown).
   */
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
      windowDurationMinutes: config.aggregationWindowMinutes,
    }
  }

  /**
   * Clear all windows without flushing (for testing).
   */
  clear(): void {
    if (this.movieWindow.timer) {
      clearTimeout(this.movieWindow.timer)
    }
    if (this.seriesWindow.timer) {
      clearTimeout(this.seriesWindow.timer)
    }
    this.movieWindow = { items: [], timer: null, startTime: null }
    this.seriesWindow = { items: [], timer: null, startTime: null }
  }
}

// Singleton instance
export const aggregationService = new AggregationService()
