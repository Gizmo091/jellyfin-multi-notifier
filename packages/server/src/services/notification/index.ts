import { MediaEvent, MediaType } from '../../types/index.js'
import { config } from '../../config.js'
import { whatsappClient } from '../whatsapp/client.js'
import { aggregationService } from '../aggregation/index.js'
import { queueService } from '../queue/index.js'
import { retryService } from '../retry/index.js'
import { statusService } from '../status/index.js'
import { settingsService } from '../settings/index.js'

/**
 * Notification service for formatting and sending WhatsApp messages.
 * Listens to aggregation events and sends formatted notifications.
 * Queues messages when WhatsApp is disconnected for later delivery.
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
   * Queues the message if WhatsApp is disconnected.
   */
  async sendMoviesNotification(items: MediaEvent[]): Promise<boolean> {
    if (items.length === 0) {
      console.log('No movies to notify')
      return false
    }

    const groupId = settingsService.getWhatsAppGroupId()
    if (!groupId) {
      console.warn('WhatsApp group ID not configured, skipping notification')
      return false
    }

    const message = this.formatMoviesMessage(items)
    const coverUrl = items.find((i) => i.coverUrl)?.coverUrl

    return this.sendOrQueue(message, 'movie', coverUrl, items.length, groupId)
  }

  /**
   * Format and send a series notification.
   * Queues the message if WhatsApp is disconnected.
   */
  async sendSeriesNotification(items: MediaEvent[]): Promise<boolean> {
    if (items.length === 0) {
      console.log('No series to notify')
      return false
    }

    const groupId = settingsService.getWhatsAppGroupId()
    if (!groupId) {
      console.warn('WhatsApp group ID not configured, skipping notification')
      return false
    }

    const message = this.formatSeriesMessage(items)
    const coverUrl = items.find((i) => i.coverUrl)?.coverUrl

    return this.sendOrQueue(message, 'series', coverUrl, items.length, groupId)
  }

  /**
   * Send message directly if connected, otherwise queue it.
   * Schedules retry with exponential backoff on failure.
   * Records notification in status service for tracking.
   */
  private async sendOrQueue(message: string, mediaType: MediaType, imageUrl?: string, itemCount = 1, groupId?: string): Promise<boolean> {
    const notificationType = mediaType === 'movie' ? 'movies' : 'series'
    const targetGroupId = groupId || settingsService.getWhatsAppGroupId()

    if (!targetGroupId) {
      console.warn('WhatsApp group ID not configured, skipping notification')
      return false
    }

    if (!whatsappClient.isConnected()) {
      console.log(`WhatsApp disconnected, queuing ${mediaType} notification`)
      queueService.addMessage(message, mediaType, imageUrl)
      statusService.recordNotification(notificationType, itemCount, false)
      // Will be processed on reconnection by retryService
      return false
    }

    console.log(`Sending ${mediaType} notification${imageUrl ? ' with cover' : ''}`)

    let success: boolean
    if (imageUrl) {
      success = await whatsappClient.sendImageMessage(targetGroupId, imageUrl, message)
    } else {
      success = await whatsappClient.sendTextMessage(targetGroupId, message)
    }

    if (!success) {
      console.log(`Failed to send ${mediaType} notification, queuing for retry`)
      const messageId = queueService.addMessage(message, mediaType, imageUrl)
      retryService.scheduleRetry(messageId)
    }

    statusService.recordNotification(notificationType, itemCount, success)
    return success
  }

  /**
   * Send a queued message by ID.
   * Returns true if sent successfully, false otherwise.
   */
  async sendQueuedMessage(messageId: number): Promise<boolean> {
    const msg = queueService.getMessage(messageId)
    if (!msg) {
      console.warn(`Queued message ${messageId} not found`)
      return false
    }

    const groupId = settingsService.getWhatsAppGroupId()
    if (!groupId) {
      console.warn('WhatsApp group ID not configured, cannot send queued message')
      return false
    }

    if (!whatsappClient.isConnected()) {
      console.log(`WhatsApp disconnected, cannot send queued message ${messageId}`)
      return false
    }

    let success: boolean
    if (msg.imageUrl) {
      success = await whatsappClient.sendImageMessage(groupId, msg.imageUrl, msg.content)
    } else {
      success = await whatsappClient.sendTextMessage(groupId, msg.content)
    }

    if (success) {
      queueService.updateStatus(messageId, 'sent')
      // Optionally remove sent messages immediately
      queueService.removeMessage(messageId)
    }

    return success
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
