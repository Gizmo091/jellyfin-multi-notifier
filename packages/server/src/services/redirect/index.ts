import { nanoid } from 'nanoid'
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { config } from '../../config.js'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'queue.db')

export interface RedirectEntry {
  shortId: string
  jellyfinId: string
  title: string
  createdAt: Date
}

/**
 * Service for managing redirect links to Jellyfin content.
 * Persists to SQLite for survival across restarts.
 */
class RedirectService {
  private db: Database.Database

  constructor() {
    this.ensureDataDirectory()
    this.db = new Database(DB_PATH)
    this.initialize()
  }

  /**
   * Ensures the data directory exists.
   */
  private ensureDataDirectory(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
      console.log(`Created data directory: ${DATA_DIR}`)
    }
  }

  /**
   * Initialize the database schema.
   */
  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS redirects (
        short_id TEXT PRIMARY KEY,
        jellyfin_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create index for cleanup queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_redirects_created_at ON redirects(created_at)
    `)

    console.log('RedirectService initialized with SQLite persistence')
  }

  /**
   * Create a redirect link for a media item.
   * Returns the short path like "/r/abc12345"
   */
  createRedirect(jellyfinId: string, title: string): string {
    const shortId = nanoid(8) // 8 char unique ID

    const stmt = this.db.prepare(`
      INSERT INTO redirects (short_id, jellyfin_id, title)
      VALUES (?, ?, ?)
    `)
    stmt.run(shortId, jellyfinId, title)

    console.log(`Created redirect /${shortId} for "${title}" (${jellyfinId})`)
    return `/r/${shortId}`
  }

  /**
   * Get the full redirect URL including the server base URL.
   */
  getFullRedirectUrl(jellyfinId: string, title: string): string {
    const path = this.createRedirect(jellyfinId, title)
    return path
  }

  /**
   * Get the Jellyfin URL for a redirect ID.
   * Returns null if the redirect doesn't exist.
   */
  getJellyfinUrl(shortId: string): string | null {
    const entry = this.getEntry(shortId)
    if (!entry) return null

    // Build Jellyfin web client URL
    return `${config.jellyfinUrl}/web/index.html#!/details?id=${entry.jellyfinId}`
  }

  /**
   * Get redirect entry by ID.
   */
  getEntry(shortId: string): RedirectEntry | null {
    const stmt = this.db.prepare(`
      SELECT short_id, jellyfin_id, title, created_at
      FROM redirects
      WHERE short_id = ?
    `)
    const row = stmt.get(shortId) as {
      short_id: string
      jellyfin_id: string
      title: string
      created_at: string
    } | undefined

    if (!row) return null

    return {
      shortId: row.short_id,
      jellyfinId: row.jellyfin_id,
      title: row.title,
      createdAt: new Date(row.created_at),
    }
  }

  /**
   * Get all redirect entries (for debugging/admin).
   */
  getAllEntries(): RedirectEntry[] {
    const stmt = this.db.prepare(`
      SELECT short_id, jellyfin_id, title, created_at
      FROM redirects
      ORDER BY created_at DESC
    `)
    const rows = stmt.all() as Array<{
      short_id: string
      jellyfin_id: string
      title: string
      created_at: string
    }>

    return rows.map((row) => ({
      shortId: row.short_id,
      jellyfinId: row.jellyfin_id,
      title: row.title,
      createdAt: new Date(row.created_at),
    }))
  }

  /**
   * Get the count of stored redirects.
   */
  getCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM redirects')
    const result = stmt.get() as { count: number }
    return result.count
  }

  /**
   * Clear old redirects (older than specified hours).
   * Returns the number of entries removed.
   */
  clearOldEntries(maxAgeHours = 24 * 30): number {
    const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000)
    const cutoffStr = cutoffDate.toISOString()

    const stmt = this.db.prepare(`
      DELETE FROM redirects
      WHERE created_at < ?
    `)
    const result = stmt.run(cutoffStr)

    if (result.changes > 0) {
      console.log(`Cleared ${result.changes} old redirect entries`)
    }

    return result.changes
  }
}

// Singleton instance
export const redirectService = new RedirectService()
