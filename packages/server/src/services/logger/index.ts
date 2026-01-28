import { EventEmitter } from 'events'

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

const MAX_LOGS = 500

/**
 * In-memory logger service for admin visibility.
 * Stores recent logs and emits events for real-time updates.
 */
class LoggerService extends EventEmitter {
  private logs: LogEntry[] = []
  private nextId = 1

  /**
   * Add a log entry.
   */
  private log(level: LogLevel, category: string, message: string, data?: Record<string, unknown>): void {
    const nowNs = process.hrtime.bigint() + hrtimeOffset
    const entry: LogEntry = {
      id: this.nextId++,
      timestamp: new Date(Number(nowNs / 1_000_000n)),
      timestampNs: nowNs.toString(),
      level,
      category,
      message,
      data,
    }

    this.logs.push(entry)

    // Keep only last MAX_LOGS entries
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(-MAX_LOGS)
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
   * Get all logs, optionally filtered.
   */
  getLogs(options?: {
    level?: LogLevel
    category?: string
    limit?: number
    since?: Date
  }): LogEntry[] {
    let result = [...this.logs]

    if (options?.level) {
      result = result.filter(l => l.level === options.level)
    }

    if (options?.category) {
      result = result.filter(l => l.category === options.category)
    }

    if (options?.since) {
      result = result.filter(l => l.timestamp >= options.since!)
    }

    if (options?.limit) {
      result = result.slice(-options.limit)
    }

    return result
  }

  /**
   * Clear all logs.
   */
  clear(): void {
    this.logs = []
    this.emit('clear')
  }

  /**
   * Get log count.
   */
  getCount(): number {
    return this.logs.length
  }
}

// Singleton instance
export const logger = new LoggerService()
