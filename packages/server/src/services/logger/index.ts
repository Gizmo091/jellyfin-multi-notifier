import { EventEmitter } from 'events'
import Database from 'better-sqlite3'
import { DB_PATH, ensureDataDirectory } from '../../config.js'

// Compute offset to convert monotonic hrtime to wall-clock nanoseconds.
// wallClockNs = hrtime.bigint() + hrtimeOffset
const hrtimeOffset = BigInt(Date.now()) * 1_000_000n - process.hrtime.bigint()

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: number
  timestamp: Date
  /** High-resolution timestamp in nanoseconds (as string for JSON serialization) */
  timestampNs: string
  level: LogLevel
  category: string
  message: string
  data?: Record<string, unknown>
}

interface DbLogRow {
  id: number
  timestamp_ns: string
  level: string
  category: string
  message: string
  data: string | null
}

const MAX_LOGS = 500
// Keep logs for 7 days
const LOG_RETENTION_DAYS = 7

/**
 * Logger service with SQLite persistence.
 * Stores logs in database for survival across restarts.
 * Emits events for real-time updates.
 */
class LoggerService extends EventEmitter {
  private db: Database.Database

  constructor() {
    super()
    ensureDataDirectory()
    this.db = new Database(DB_PATH)
    this.initializeDatabase()
    this.cleanup()
  }

  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp_ns TEXT NOT NULL,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT
      )
    `)

    // Create index for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs (timestamp_ns DESC)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_logs_level ON logs (level)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_logs_category ON logs (category)
    `)
  }

  /**
   * Clean up old logs (older than LOG_RETENTION_DAYS)
   */
  private cleanup(): void {
    const cutoffTime = Date.now() - (LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const cutoffNs = BigInt(cutoffTime) * 1_000_000n

    const stmt = this.db.prepare('DELETE FROM logs WHERE timestamp_ns < ?')
    const result = stmt.run(cutoffNs.toString())

    if (result.changes > 0) {
      console.info(`[Logger] Cleaned up ${result.changes} old log entries`)
    }

    // Also keep only MAX_LOGS * 10 entries to prevent unbounded growth
    // (we keep more in DB than we return to allow filtering)
    const maxDbLogs = MAX_LOGS * 10
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM logs')
    const count = (countStmt.get() as { count: number }).count

    if (count > maxDbLogs) {
      const deleteCount = count - maxDbLogs
      const deleteStmt = this.db.prepare(`
        DELETE FROM logs WHERE id IN (
          SELECT id FROM logs ORDER BY timestamp_ns ASC LIMIT ?
        )
      `)
      deleteStmt.run(deleteCount)
    }
  }

  /**
   * Add a log entry.
   */
  private log(level: LogLevel, category: string, message: string, data?: Record<string, unknown>): void {
    const nowNs = process.hrtime.bigint() + hrtimeOffset
    const dataJson = data ? JSON.stringify(data) : null

    // Insert into database
    const stmt = this.db.prepare(`
      INSERT INTO logs (timestamp_ns, level, category, message, data)
      VALUES (?, ?, ?, ?, ?)
    `)
    const result = stmt.run(nowNs.toString(), level, category, message, dataJson)

    const entry: LogEntry = {
      id: result.lastInsertRowid as number,
      timestamp: new Date(Number(nowNs / 1_000_000n)),
      timestampNs: nowNs.toString(),
      level,
      category,
      message,
      data,
    }

    // Also log to console
    const consoleMsg = `[${category}] ${message}`
    switch (level) {
      case 'debug':
        console.debug(consoleMsg, data || '')
        break
      case 'info':
        console.info(consoleMsg, data || '')
        break
      case 'warn':
        console.warn(consoleMsg, data || '')
        break
      case 'error':
        console.error(consoleMsg, data || '')
        break
    }

    this.emit('log', entry)
  }

  debug(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('debug', category, message, data)
  }

  info(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('info', category, message, data)
  }

  warn(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('warn', category, message, data)
  }

  error(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('error', category, message, data)
  }

  /**
   * Convert a database row to a LogEntry
   */
  private rowToEntry(row: DbLogRow): LogEntry {
    return {
      id: row.id,
      timestamp: new Date(Number(BigInt(row.timestamp_ns) / 1_000_000n)),
      timestampNs: row.timestamp_ns,
      level: row.level as LogLevel,
      category: row.category,
      message: row.message,
      data: row.data ? JSON.parse(row.data) : undefined,
    }
  }

  /**
   * Get all logs, optionally filtered.
   */
  getLogs(options?: {
    level?: LogLevel
    category?: string
    limit?: number
    since?: Date
  }): LogEntry[] {
    const conditions: string[] = []
    const params: (string | number)[] = []

    if (options?.level) {
      conditions.push('level = ?')
      params.push(options.level)
    }

    if (options?.category) {
      conditions.push('category = ?')
      params.push(options.category)
    }

    if (options?.since) {
      const sinceNs = BigInt(options.since.getTime()) * 1_000_000n
      conditions.push('timestamp_ns >= ?')
      params.push(sinceNs.toString())
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = options?.limit || MAX_LOGS

    const stmt = this.db.prepare(`
      SELECT * FROM logs
      ${whereClause}
      ORDER BY timestamp_ns DESC
      LIMIT ?
    `)

    const rows = stmt.all(...params, limit) as DbLogRow[]

    // Return in chronological order (oldest first)
    return rows.reverse().map(row => this.rowToEntry(row))
  }

  /**
   * Clear all logs.
   */
  clear(): void {
    this.db.exec('DELETE FROM logs')
    this.emit('clear')
  }

  /**
   * Get log count.
   */
  getCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM logs')
    return (stmt.get() as { count: number }).count
  }

  /**
   * Close database connection (for graceful shutdown)
   */
  close(): void {
    this.db.close()
  }
}

// Singleton instance
export const logger = new LoggerService()
