import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import type { MediaType } from '../../types/index.js'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'queue.db')

export type QueueMessageStatus = 'pending' | 'sent' | 'failed'

export interface QueueMessage {
  id: number
  content: string
  mediaType: MediaType
  imageUrl: string | null
  status: QueueMessageStatus
  retryCount: number
  createdAt: string
  updatedAt: string
}

interface DbRow {
  id: number
  content: string
  media_type: string
  image_url: string | null
  status: string
  retry_count: number
  created_at: string
  updated_at: string
}

/**
 * Queue service for persisting messages in SQLite.
 * Ensures no message loss during restarts (NFR15).
 */
class QueueService {
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
      CREATE TABLE IF NOT EXISTS message_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        media_type TEXT NOT NULL,
        image_url TEXT,
        status TEXT DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_queue_status ON message_queue(status)
    `)

    console.log('QueueService initialized with SQLite database')
  }

  /**
   * Add a message to the queue.
   */
  addMessage(content: string, mediaType: MediaType, imageUrl?: string): number {
    const stmt = this.db.prepare(
      'INSERT INTO message_queue (content, media_type, image_url) VALUES (?, ?, ?)'
    )
    const result = stmt.run(content, mediaType, imageUrl || null)
    const id = result.lastInsertRowid as number
    console.log(`Message queued with ID ${id} (type: ${mediaType})`)
    return id
  }

  /**
   * Get all pending messages ordered by creation time.
   */
  getPendingMessages(): QueueMessage[] {
    const rows = this.db.prepare(
      'SELECT * FROM message_queue WHERE status = ? ORDER BY created_at'
    ).all('pending') as DbRow[]

    return rows.map(this.mapRowToMessage)
  }

  /**
   * Get all messages (for admin view).
   */
  getAllMessages(): QueueMessage[] {
    const rows = this.db.prepare(
      'SELECT * FROM message_queue ORDER BY created_at DESC'
    ).all() as DbRow[]

    return rows.map(this.mapRowToMessage)
  }

  /**
   * Get a message by ID.
   */
  getMessage(id: number): QueueMessage | null {
    const row = this.db.prepare(
      'SELECT * FROM message_queue WHERE id = ?'
    ).get(id) as DbRow | undefined

    return row ? this.mapRowToMessage(row) : null
  }

  /**
   * Update message status.
   */
  updateStatus(id: number, status: QueueMessageStatus): void {
    this.db.prepare(
      'UPDATE message_queue SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(status, id)
    console.log(`Message ${id} status updated to: ${status}`)
  }

  /**
   * Increment retry count for a message.
   */
  incrementRetryCount(id: number): number {
    this.db.prepare(
      'UPDATE message_queue SET retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(id)

    const row = this.db.prepare('SELECT retry_count FROM message_queue WHERE id = ?').get(id) as { retry_count: number }
    return row.retry_count
  }

  /**
   * Remove a message from the queue.
   */
  removeMessage(id: number): void {
    this.db.prepare('DELETE FROM message_queue WHERE id = ?').run(id)
    console.log(`Message ${id} removed from queue`)
  }

  /**
   * Get count of pending messages.
   */
  getPendingCount(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM message_queue WHERE status = ?'
    ).get('pending') as { count: number }
    return row.count
  }

  /**
   * Get count of all messages by status.
   */
  getStatusCounts(): { pending: number; sent: number; failed: number } {
    const rows = this.db.prepare(
      'SELECT status, COUNT(*) as count FROM message_queue GROUP BY status'
    ).all() as { status: string; count: number }[]

    const counts = { pending: 0, sent: 0, failed: 0 }
    for (const row of rows) {
      if (row.status in counts) {
        counts[row.status as keyof typeof counts] = row.count
      }
    }
    return counts
  }

  /**
   * Clear all sent messages (cleanup).
   */
  clearSentMessages(): number {
    const result = this.db.prepare('DELETE FROM message_queue WHERE status = ?').run('sent')
    const count = result.changes
    if (count > 0) {
      console.log(`Cleared ${count} sent messages from queue`)
    }
    return count
  }

  /**
   * Map database row to QueueMessage.
   */
  private mapRowToMessage(row: DbRow): QueueMessage {
    return {
      id: row.id,
      content: row.content,
      mediaType: row.media_type as MediaType,
      imageUrl: row.image_url,
      status: row.status as QueueMessageStatus,
      retryCount: row.retry_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close()
    console.log('QueueService database connection closed')
  }
}

// Singleton instance
export const queueService = new QueueService()
