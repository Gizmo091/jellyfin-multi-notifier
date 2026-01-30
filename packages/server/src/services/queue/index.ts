import Database from 'better-sqlite3'
import type { MediaType, ChannelType } from '../../types/index.js'
import { DB_PATH, ensureDataDirectory } from '../../config.js'
import { logger } from '../logger/index.js'

export type QueueMessageStatus = 'pending' | 'sent' | 'failed'

export interface QueueMessage {
  id: number
  content: string
  mediaType: MediaType
  imageUrl: string | null
  channelId: string | null
  channelType: ChannelType | null
  status: QueueMessageStatus
  retryCount: number
  createdAt: string
  updatedAt: string
}

export interface DeadLetterMessage {
  id: number
  originalId: number
  content: string
  mediaType: MediaType
  imageUrl: string | null
  channelId: string | null
  channelType: ChannelType | null
  retryCount: number
  failureReason: string
  originalCreatedAt: string
  failedAt: string
}

interface DbRow {
  id: number
  content: string
  media_type: string
  image_url: string | null
  channel_id: string | null
  channel_type: string | null
  status: string
  retry_count: number
  created_at: string
  updated_at: string
}

interface DbDeadLetterRow {
  id: number
  original_id: number
  content: string
  media_type: string
  image_url: string | null
  channel_id: string | null
  channel_type: string | null
  retry_count: number
  failure_reason: string
  original_created_at: string
  failed_at: string
}

/**
 * Queue service for persisting messages in SQLite.
 * Ensures no message loss during restarts (NFR15).
 */
class QueueService {
  private db: Database.Database

  constructor() {
    ensureDataDirectory()
    this.db = new Database(DB_PATH)
    this.initialize()
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
        channel_id TEXT,
        channel_type TEXT,
        status TEXT DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_queue_status ON message_queue(status)
    `)

    // Dead-letter queue for permanently failed messages
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dead_letter_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        media_type TEXT NOT NULL,
        image_url TEXT,
        channel_id TEXT,
        channel_type TEXT,
        retry_count INTEGER NOT NULL,
        failure_reason TEXT NOT NULL,
        original_created_at TEXT NOT NULL,
        failed_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dlq_failed_at ON dead_letter_queue(failed_at)
    `)

    // Add channel columns if they don't exist (migration for existing databases)
    this.migrateAddChannelColumns()

    logger.info('Queue', 'QueueService initialized with SQLite database')
  }

  /**
   * Add channel_id and channel_type columns if they don't exist.
   */
  private migrateAddChannelColumns(): void {
    // Check if channel_id column exists
    const tableInfo = this.db.prepare("PRAGMA table_info(message_queue)").all() as { name: string }[]
    const hasChannelId = tableInfo.some(col => col.name === 'channel_id')

    if (!hasChannelId) {
      this.db.exec('ALTER TABLE message_queue ADD COLUMN channel_id TEXT')
      this.db.exec('ALTER TABLE message_queue ADD COLUMN channel_type TEXT')
      logger.info('Queue', 'Added channel_id and channel_type columns')
    }
  }

  /**
   * Add a message to the queue.
   */
  addMessage(content: string, mediaType: MediaType, imageUrl?: string, channelId?: string, channelType?: ChannelType): number {
    const stmt = this.db.prepare(
      'INSERT INTO message_queue (content, media_type, image_url, channel_id, channel_type) VALUES (?, ?, ?, ?, ?)'
    )
    const result = stmt.run(content, mediaType, imageUrl || null, channelId || null, channelType || null)
    const id = result.lastInsertRowid as number
    logger.debug('Queue', `Message queued with ID ${id}`, { mediaType, channelId: channelId || 'all' })
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
    logger.debug('Queue', `Message ${id} status updated to: ${status}`)
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
    logger.debug('Queue', `Message ${id} removed from queue`)
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
      logger.info('Queue', `Cleared ${count} sent messages from queue`)
    }
    return count
  }

  /**
   * Get pending messages for a specific channel type.
   */
  getPendingByChannelType(channelType: ChannelType): QueueMessage[] {
    const rows = this.db.prepare(
      'SELECT * FROM message_queue WHERE status = ? AND channel_type = ? ORDER BY created_at'
    ).all('pending', channelType) as DbRow[]

    return rows.map(this.mapRowToMessage)
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
      channelId: row.channel_id,
      channelType: row.channel_type as ChannelType | null,
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
    logger.info('Queue', 'QueueService database connection closed')
  }

  /**
   * Move a permanently failed message to the dead-letter queue.
   * Removes it from the main queue.
   */
  moveToDeadLetter(id: number, failureReason: string): void {
    const message = this.getMessage(id)
    if (!message) {
      logger.warn('Queue', `Cannot move message ${id} to dead-letter: not found`)
      return
    }

    const stmt = this.db.prepare(`
      INSERT INTO dead_letter_queue (
        original_id, content, media_type, image_url, channel_id, channel_type,
        retry_count, failure_reason, original_created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      message.id,
      message.content,
      message.mediaType,
      message.imageUrl,
      message.channelId,
      message.channelType,
      message.retryCount,
      failureReason,
      message.createdAt
    )

    this.removeMessage(id)
    logger.warn('Queue', `Message ${id} moved to dead-letter queue`, { reason: failureReason })
  }

  /**
   * Get all dead-letter messages.
   */
  getDeadLetterMessages(): DeadLetterMessage[] {
    const rows = this.db.prepare(
      'SELECT * FROM dead_letter_queue ORDER BY failed_at DESC'
    ).all() as DbDeadLetterRow[]

    return rows.map(this.mapDeadLetterRowToMessage)
  }

  /**
   * Get dead-letter message count.
   */
  getDeadLetterCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM dead_letter_queue').get() as { count: number }
    return row.count
  }

  /**
   * Clear all dead-letter messages.
   */
  clearDeadLetterMessages(): number {
    const result = this.db.prepare('DELETE FROM dead_letter_queue').run()
    if (result.changes > 0) {
      logger.info('Queue', `Cleared ${result.changes} dead-letter messages`)
    }
    return result.changes
  }

  /**
   * Map dead-letter database row to DeadLetterMessage.
   */
  private mapDeadLetterRowToMessage(row: DbDeadLetterRow): DeadLetterMessage {
    return {
      id: row.id,
      originalId: row.original_id,
      content: row.content,
      mediaType: row.media_type as MediaType,
      imageUrl: row.image_url,
      channelId: row.channel_id,
      channelType: row.channel_type as ChannelType | null,
      retryCount: row.retry_count,
      failureReason: row.failure_reason,
      originalCreatedAt: row.original_created_at,
      failedAt: row.failed_at,
    }
  }
}

// Singleton instance
export const queueService = new QueueService()
