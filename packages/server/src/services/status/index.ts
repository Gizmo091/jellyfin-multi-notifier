import { EventEmitter } from 'events'

interface NotificationRecord {
  timestamp: Date
  type: 'movies' | 'series'
  count: number
  success: boolean
}

class StatusService extends EventEmitter {
  private startTime: Date
  private lastNotification: NotificationRecord | null = null
  private recentNotifications: NotificationRecord[] = []
  private readonly MAX_RECENT = 10

  constructor() {
    super()
    this.startTime = new Date()
  }

  /**
   * Records a notification being sent.
   */
  recordNotification(type: 'movies' | 'series', count: number, success: boolean): void {
    const record: NotificationRecord = {
      timestamp: new Date(),
      type,
      count,
      success,
    }

    this.lastNotification = record
    this.recentNotifications.unshift(record)

    // Keep only recent notifications
    if (this.recentNotifications.length > this.MAX_RECENT) {
      this.recentNotifications = this.recentNotifications.slice(0, this.MAX_RECENT)
    }

    console.log(`[status] Recorded ${type} notification: ${count} items, success=${success}`)
  }

  /**
   * Gets the service uptime in seconds.
   */
  getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000)
  }

  /**
   * Gets the formatted uptime string.
   */
  getUptimeFormatted(): string {
    const totalSeconds = this.getUptimeSeconds()
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    const parts: string[] = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0) parts.push(`${minutes}m`)
    parts.push(`${seconds}s`)

    return parts.join(' ')
  }

  /**
   * Gets the last notification record.
   */
  getLastNotification(): NotificationRecord | null {
    return this.lastNotification
  }

  /**
   * Gets recent notifications.
   */
  getRecentNotifications(): NotificationRecord[] {
    return this.recentNotifications
  }

  /**
   * Gets the full status summary.
   */
  getStatus(): {
    uptime: { seconds: number; formatted: string }
    startTime: string
    lastNotification: NotificationRecord | null
    recentNotifications: NotificationRecord[]
  } {
    return {
      uptime: {
        seconds: this.getUptimeSeconds(),
        formatted: this.getUptimeFormatted(),
      },
      startTime: this.startTime.toISOString(),
      lastNotification: this.lastNotification,
      recentNotifications: this.recentNotifications,
    }
  }
}

export const statusService = new StatusService()
