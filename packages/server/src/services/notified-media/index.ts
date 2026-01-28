import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { logger } from '../logger/index.js'

// Database path - same location as other services
const DATA_DIR = process.env.NODE_ENV === 'production' ? '/app/data' : './data'
const DB_PATH = path.join(DATA_DIR, 'queue.db')

// How long to keep notified media records (90 days)
const RETENTION_DAYS = 90

/**
 * Service to track which media items have been notified.
 * Prevents duplicate notifications for the same media.
 */
class NotifiedMediaService {
  private db: Database.Database

  constructor() {
    this.ensureDataDirectory()
    this.db = new Database(DB_PATH)
    this.initializeDatabase()
    this.cleanup()
  }

  private ensureDataDirectory(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
  }

  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notified_media (
        jellyfin_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT,
        notified_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (jellyfin_id, event_type)
      )
    `)

    // Create index for faster lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notified_media_lookup
      ON notified_media (jellyfin_id, event_type)
    `)

    logger.info('NotifiedMedia', 'Database initialized for tracking notified media')
  }

  /**
   * Clean up old records to prevent database bloat.
   */
  private cleanup(): void {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS)

    const result = this.db.prepare(`
      DELETE FROM notified_media WHERE notified_at < ?
    `).run(cutoffDate.toISOString())

    if (result.changes > 0) {
      logger.info('NotifiedMedia', `Cleaned up ${result.changes} old notified media records`)
    }
  }

  /**
   * Check if a media item has already been notified.
   * @param jellyfinId The Jellyfin item ID
   * @param eventType The event type (added or removed)
   * @returns true if already notified, false otherwise
   */
  isNotified(jellyfinId: string, eventType: 'added' | 'removed'): boolean {
    const row = this.db.prepare(`
      SELECT 1 FROM notified_media WHERE jellyfin_id = ? AND event_type = ?
    `).get(jellyfinId, eventType)

    return !!row
  }

  /**
   * Mark a media item as notified.
   * @param jellyfinId The Jellyfin item ID
   * @param eventType The event type (added or removed)
   * @param title Optional title for logging/debugging
   */
  markNotified(jellyfinId: string, eventType: 'added' | 'removed', title?: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO notified_media (jellyfin_id, event_type, title, notified_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(jellyfinId, eventType, title || null)

    logger.debug('NotifiedMedia', `Marked "${title || jellyfinId}" as notified`, {
      jellyfinId,
      eventType,
    })
  }

  /**
   * Mark multiple media items as notified.
   * @param items Array of items to mark
   */
  markManyNotified(items: Array<{ jellyfinId: string; eventType: 'added' | 'removed'; title?: string }>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO notified_media (jellyfin_id, event_type, title, notified_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `)

    const transaction = this.db.transaction(() => {
      for (const item of items) {
        stmt.run(item.jellyfinId, item.eventType, item.title || null)
      }
    })

    transaction()

    logger.info('NotifiedMedia', `Marked ${items.length} items as notified`, {
      count: items.length,
      titles: items.map(i => i.title).filter(Boolean),
    })
  }

  /**
   * Get count of notified media records.
   */
  getCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM notified_media').get() as { count: number }
    return row.count
  }

  /**
   * Clear a specific notification record (for re-notification).
   */
  clearNotification(jellyfinId: string, eventType: 'added' | 'removed'): void {
    this.db.prepare(`
      DELETE FROM notified_media WHERE jellyfin_id = ? AND event_type = ?
    `).run(jellyfinId, eventType)
  }
}

// Singleton instance
export const notifiedMediaService = new NotifiedMediaService()
