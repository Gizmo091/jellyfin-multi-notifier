import { EventEmitter } from 'events'
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { MediaEvent } from '../../types/index.js'
import { config } from '../../config.js'
import { redirectService } from '../redirect/index.js'
import { logger } from '../logger/index.js'

// Database path - same location as other services
const DATA_DIR = process.env.NODE_ENV === 'production' ? '/app/data' : './data'
const DB_PATH = path.join(DATA_DIR, 'queue.db')

interface AggregationWindow {
  items: MediaEvent[]
  timer: NodeJS.Timeout | null
  startTime: Date | null
}

type WindowKey = 'movies' | 'series' | 'movies-removed' | 'series-removed'

export interface AggregationWindowStatus {
  count: number
  windowStart: Date | null
  items: MediaEvent[]
  windowDurationMinutes: number
}

export interface AggregationStatus {
  movies: AggregationWindowStatus
  series: AggregationWindowStatus
  moviesRemoved: AggregationWindowStatus
  seriesRemoved: AggregationWindowStatus
}

function createEmptyWindow(): AggregationWindow {
  return { items: [], timer: null, startTime: null }
}

/**
 * Aggregation service for batching media notifications.
 * Maintains separate windows for movies/series, added/removed.
 * Emits 'movies-ready', 'series-ready', 'movies-removed-ready',
 * and 'series-removed-ready' events when windows flush.
 *
 * Events are persisted to SQLite to survive restarts.
 */
class AggregationService extends EventEmitter {
  private db: Database.Database
  private movieWindow: AggregationWindow = createEmptyWindow()
  private seriesWindow: AggregationWindow = createEmptyWindow()
  private movieRemovedWindow: AggregationWindow = createEmptyWindow()
  private seriesRemovedWindow: AggregationWindow = createEmptyWindow()

  constructor() {
    super()
    this.ensureDataDirectory()
    this.db = new Database(DB_PATH)
    this.initializeDatabase()
    this.restoreFromDatabase()
  }

  private ensureDataDirectory(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
  }

  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS aggregation_events (
        id TEXT PRIMARY KEY,
        window_type TEXT NOT NULL,
        event_data TEXT NOT NULL,
        window_start TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)
    logger.info('Aggregation', 'Database initialized for persistence')
  }

  /**
   * Restore events from database on startup.
   */
  private restoreFromDatabase(): void {
    const rows = this.db.prepare(`
      SELECT window_type, event_data, window_start
      FROM aggregation_events
      ORDER BY created_at ASC
    `).all() as Array<{ window_type: string; event_data: string; window_start: string | null }>

    if (rows.length === 0) {
      logger.info('Aggregation', 'No persisted events to restore')
      return
    }

    // Group events by window type
    const eventsByWindow: Record<string, { events: MediaEvent[]; windowStart: Date | null }> = {}

    for (const row of rows) {
      const event = JSON.parse(row.event_data) as MediaEvent
      // Restore Date objects
      event.timestamp = new Date(event.timestamp)

      if (!eventsByWindow[row.window_type]) {
        eventsByWindow[row.window_type] = {
          events: [],
          windowStart: row.window_start ? new Date(row.window_start) : null,
        }
      }
      eventsByWindow[row.window_type].events.push(event)
    }

    // Restore each window
    for (const [windowType, data] of Object.entries(eventsByWindow)) {
      const window = this.getWindow(windowType as WindowKey)
      if (!window) continue

      window.items = data.events
      window.startTime = data.windowStart

      // Calculate remaining time and restart timer
      if (data.windowStart) {
        const elapsed = Date.now() - data.windowStart.getTime()
        const totalDuration = this.getWindowDurationMs(windowType as WindowKey)
        const remaining = Math.max(0, totalDuration - elapsed)

        if (remaining > 0) {
          window.timer = setTimeout(() => this.flushWindow(window, windowType as WindowKey), remaining)
          logger.info('Aggregation', `Restored ${data.events.length} events to ${windowType} window, ${Math.round(remaining / 1000)}s remaining`, {
            windowType,
            eventCount: data.events.length,
            remainingSeconds: Math.round(remaining / 1000),
          })
        } else {
          // Window has expired, flush immediately
          logger.info('Aggregation', `Restored ${data.events.length} events to ${windowType} window, flushing immediately (expired)`, {
            windowType,
            eventCount: data.events.length,
          })
          setImmediate(() => this.flushWindow(window, windowType as WindowKey))
        }
      }
    }

    logger.info('Aggregation', `Restored ${rows.length} total events from database`)
  }

  private getWindow(type: WindowKey): AggregationWindow | null {
    switch (type) {
      case 'movies': return this.movieWindow
      case 'series': return this.seriesWindow
      case 'movies-removed': return this.movieRemovedWindow
      case 'series-removed': return this.seriesRemovedWindow
      default: return null
    }
  }

  /**
   * Persist an event to the database.
   */
  private persistEvent(event: MediaEvent, windowType: WindowKey, windowStart: Date | null): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO aggregation_events (id, window_type, event_data, window_start)
      VALUES (?, ?, ?, ?)
    `).run(event.id, windowType, JSON.stringify(event), windowStart?.toISOString() || null)
  }

  /**
   * Remove all events for a window from the database.
   */
  private clearPersistedWindow(windowType: WindowKey): void {
    this.db.prepare('DELETE FROM aggregation_events WHERE window_type = ?').run(windowType)
  }

  /**
   * Get the window duration in milliseconds for a specific window type.
   */
  private getWindowDurationMs(type: WindowKey): number {
    const minutes = {
      'movies': config.aggregationWindowMinutes.movies,
      'series': config.aggregationWindowMinutes.series,
      'movies-removed': config.aggregationWindowMinutes.moviesRemoved,
      'series-removed': config.aggregationWindowMinutes.seriesRemoved,
    }[type]
    return minutes * 60 * 1000
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
   * Deduplicates by jellyfinId to handle multiple webhook calls for the same item.
   * Persists the event to SQLite for crash recovery.
   */
  private addToWindow(window: AggregationWindow, event: MediaEvent, type: WindowKey): void {
    // Deduplicate: skip if item with same jellyfinId already exists in window
    const isDuplicate = window.items.some(item => item.jellyfinId === event.jellyfinId)
    if (isDuplicate) {
      logger.debug('Aggregation', `Skipping duplicate ${event.type} "${event.title}" (${event.jellyfinId})`, { type: event.type, title: event.title, jellyfinId: event.jellyfinId })
      return
    }

    window.items.push(event)
    logger.info('Aggregation', `Added ${event.type} "${event.title}" to ${type} window`, { type: event.type, title: event.title, windowType: type, itemCount: window.items.length })

    if (!window.timer) {
      const durationMs = this.getWindowDurationMs(type)
      const durationMinutes = durationMs / 60000
      window.startTime = new Date()
      window.timer = setTimeout(() => this.flushWindow(window, type), durationMs)
      logger.info('Aggregation', `Started ${type} aggregation window (${durationMinutes} min)`, { windowType: type, durationMinutes })
    }

    // Persist to database for crash recovery
    this.persistEvent(event, type, window.startTime)
  }

  /**
   * Flush a window and emit the ready event with accumulated items.
   * Enhances items with high-quality covers before emitting.
   * Clears persisted events from database after successful flush.
   */
  private async flushWindow(window: AggregationWindow, type: WindowKey): Promise<void> {
    if (window.items.length === 0) {
      window.timer = null
      window.startTime = null
      this.clearPersistedWindow(type)
      logger.debug('Aggregation', `Skipping flush for empty ${type} window`)
      return
    }

    const items = [...window.items]
    window.items = []
    window.timer = null
    window.startTime = null

    // Clear from database before emitting (events are now "in flight")
    this.clearPersistedWindow(type)

    logger.info('Aggregation', `Flushing ${type} window with ${items.length} items`, { windowType: type, itemCount: items.length, titles: items.map(i => i.title) })

    // Add redirect URLs for each item (covers will be fetched per-language in notification service)
    const enhancedItems = items.map((item) => ({
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
        windowDurationMinutes: config.aggregationWindowMinutes.movies,
      },
      series: {
        count: this.seriesWindow.items.length,
        windowStart: this.seriesWindow.startTime,
        items: [...this.seriesWindow.items],
        windowDurationMinutes: config.aggregationWindowMinutes.series,
      },
      moviesRemoved: {
        count: this.movieRemovedWindow.items.length,
        windowStart: this.movieRemovedWindow.startTime,
        items: [...this.movieRemovedWindow.items],
        windowDurationMinutes: config.aggregationWindowMinutes.moviesRemoved,
      },
      seriesRemoved: {
        count: this.seriesRemovedWindow.items.length,
        windowStart: this.seriesRemovedWindow.startTime,
        items: [...this.seriesRemovedWindow.items],
        windowDurationMinutes: config.aggregationWindowMinutes.seriesRemoved,
      },
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

    // Clear all persisted events
    this.db.prepare('DELETE FROM aggregation_events').run()
  }
}

// Singleton instance
export const aggregationService = new AggregationService()
