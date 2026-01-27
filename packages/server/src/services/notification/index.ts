import { MediaEvent } from '../../types/index.js'
import { config } from '../../config.js'
import { whatsappClient } from '../whatsapp/client.js'
import { aggregationService } from '../aggregation/index.js'

/**
 * Notification service for formatting and sending WhatsApp messages.
 * Listens to aggregation events and sends formatted notifications.
 */
class NotificationService {
  private initialized = false

  /**
   * Initialize the notification service by wiring up aggregation events.
   */
  initialize(): void {
    if (this.initialized) {
      console.log('NotificationService already initialized')
      return
    }

    aggregationService.on('movies-ready', (items: MediaEvent[]) => {
      console.log(`Movies ready event received with ${items.length} items`)
      this.sendMoviesNotification(items).catch((err) => {
        console.error('Failed to send movies notification:', err)
      })
    })

    aggregationService.on('series-ready', (items: MediaEvent[]) => {
      console.log(`Series ready event received with ${items.length} items`)
      this.sendSeriesNotification(items).catch((err) => {
        console.error('Failed to send series notification:', err)
      })
    })

    this.initialized = true
    console.log('NotificationService initialized - listening to aggregation events')
  }

  /**
   * Format and send a movies notification.
   */
  async sendMoviesNotification(items: MediaEvent[]): Promise<boolean> {
    if (items.length === 0) {
      console.log('No movies to notify')
      return false
    }

    if (!config.whatsappGroupId) {
      console.warn('WhatsApp group ID not configured, skipping notification')
      return false
    }

    const message = this.formatMoviesMessage(items)
    const coverUrl = items.find((i) => i.coverUrl)?.coverUrl

    console.log(`Sending movies notification (${items.length} items)${coverUrl ? ' with cover' : ''}`)

    if (coverUrl) {
      return whatsappClient.sendImageMessage(config.whatsappGroupId, coverUrl, message)
    }
    return whatsappClient.sendTextMessage(config.whatsappGroupId, message)
  }

  /**
   * Format and send a series notification.
   */
  async sendSeriesNotification(items: MediaEvent[]): Promise<boolean> {
    if (items.length === 0) {
      console.log('No series to notify')
      return false
    }

    if (!config.whatsappGroupId) {
      console.warn('WhatsApp group ID not configured, skipping notification')
      return false
    }

    const message = this.formatSeriesMessage(items)
    const coverUrl = items.find((i) => i.coverUrl)?.coverUrl

    console.log(`Sending series notification (${items.length} items)${coverUrl ? ' with cover' : ''}`)

    if (coverUrl) {
      return whatsappClient.sendImageMessage(config.whatsappGroupId, coverUrl, message)
    }
    return whatsappClient.sendTextMessage(config.whatsappGroupId, message)
  }

  /**
   * Format movies notification message.
   */
  private formatMoviesMessage(items: MediaEvent[]): string {
    const lines: string[] = ['Nouveaux films']

    for (const item of items) {
      const titleLine = item.year ? `${item.title} (${item.year})` : item.title
      lines.push(`\n${titleLine}`)

      if (item.redirectUrl) {
        const fullUrl = `${config.publicUrl}${item.redirectUrl}`
        lines.push(fullUrl)
      }
    }

    return lines.join('\n')
  }

  /**
   * Format series notification message.
   */
  private formatSeriesMessage(items: MediaEvent[]): string {
    const lines: string[] = ['Nouveautes series']

    for (const item of items) {
      // For episodes, the title might include series and episode info
      const titleLine = item.year ? `${item.title} (${item.year})` : item.title
      lines.push(`\n${titleLine}`)

      if (item.redirectUrl) {
        const fullUrl = `${config.publicUrl}${item.redirectUrl}`
        lines.push(fullUrl)
      }
    }

    return lines.join('\n')
  }
}

// Singleton instance
export const notificationService = new NotificationService()
