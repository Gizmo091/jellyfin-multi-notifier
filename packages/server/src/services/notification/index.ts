import { MediaEvent, MediaType } from '../../types/index.js'
import { whatsappClient } from '../whatsapp/client.js'
import { aggregationService } from '../aggregation/index.js'
import { queueService } from '../queue/index.js'
import { retryService } from '../retry/index.js'
import { statusService } from '../status/index.js'
import { settingsService } from '../settings/index.js'
import { messageFormatter } from '../message-formatter/index.js'
import { coverService } from '../cover/index.js'
import { logger } from '../logger/index.js'

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
      logger.debug('Notification', 'NotificationService already initialized')
      return
    }

    aggregationService.on('movies-ready', (items: MediaEvent[]) => {
      logger.info('Notification', `Movies ready event received with ${items.length} items`, { count: items.length })
      this.sendMoviesNotification(items).catch((err) => {
        logger.error('Notification', 'Failed to send movies notification', { error: String(err) })
      })
    })

    aggregationService.on('series-ready', (items: MediaEvent[]) => {
      logger.info('Notification', `Series ready event received with ${items.length} items`, { count: items.length })
      this.sendSeriesNotification(items).catch((err) => {
        logger.error('Notification', 'Failed to send series notification', { error: String(err) })
      })
    })

    aggregationService.on('movies-removed-ready', (items: MediaEvent[]) => {
      logger.info('Notification', `Movies removed event received with ${items.length} items`, { count: items.length })
      this.sendRemovedNotification('movies-removed', items).catch((err) => {
        logger.error('Notification', 'Failed to send movies-removed notification', { error: String(err) })
      })
    })

    aggregationService.on('series-removed-ready', (items: MediaEvent[]) => {
      logger.info('Notification', `Series removed event received with ${items.length} items`, { count: items.length })
      this.sendRemovedNotification('series-removed', items).catch((err) => {
        logger.error('Notification', 'Failed to send series-removed notification', { error: String(err) })
      })
    })

    this.initialized = true
    logger.info('Notification', 'NotificationService initialized - listening to aggregation events')
  }

  /**
   * Format and send a movies notification to all configured groups.
   * Each group receives the message in its configured language.
   * Creates a composite patchwork image when multiple covers are available.
   */
  async sendMoviesNotification(items: MediaEvent[]): Promise<boolean> {
    if (items.length === 0) {
      logger.debug('Notification', 'No movies to notify')
      return false
    }

    const groups = settingsService.getWhatsAppGroups()
    if (groups.length === 0) {
      logger.warn('Notification', 'No WhatsApp groups configured, skipping notification')
      return false
    }

    const coverUrls = items.map((i) => i.coverUrl).filter((url): url is string => !!url)
    let imageSource: string | Buffer | undefined
    let fallbackImageUrl: string | undefined

    if (coverUrls.length >= 2) {
      const composite = await coverService.createCompositeImage(coverUrls)
      if (composite) {
        imageSource = composite
        fallbackImageUrl = coverUrls[0]
      } else {
        imageSource = coverUrls[0]
      }
    } else if (coverUrls.length === 1) {
      imageSource = coverUrls[0]
    }

    let anySuccess = false

    for (const group of groups) {
      const message = messageFormatter.formatMessage('movies', items, group.language)
      const success = await this.sendOrQueue(message, 'movie', imageSource, items.length, group.groupId, fallbackImageUrl)
      if (success) anySuccess = true
      logger.info('Notification', `Movies notification to "${group.groupName}" (${group.language}): ${success ? 'sent' : 'queued'}`, { groupId: group.groupId, success })
    }

    return anySuccess
  }

  /**
   * Format and send a series notification to all configured groups.
   * Each group receives the message in its configured language.
   * Creates a composite patchwork image when multiple covers are available.
   */
  async sendSeriesNotification(items: MediaEvent[]): Promise<boolean> {
    if (items.length === 0) {
      logger.debug('Notification', 'No series to notify')
      return false
    }

    const groups = settingsService.getWhatsAppGroups()
    if (groups.length === 0) {
      logger.warn('Notification', 'No WhatsApp groups configured, skipping notification')
      return false
    }

    const coverUrls = items.map((i) => i.coverUrl).filter((url): url is string => !!url)
    let imageSource: string | Buffer | undefined
    let fallbackImageUrl: string | undefined

    if (coverUrls.length >= 2) {
      const composite = await coverService.createCompositeImage(coverUrls)
      if (composite) {
        imageSource = composite
        fallbackImageUrl = coverUrls[0]
      } else {
        imageSource = coverUrls[0]
      }
    } else if (coverUrls.length === 1) {
      imageSource = coverUrls[0]
    }

    let anySuccess = false

    for (const group of groups) {
      const message = messageFormatter.formatMessage('series', items, group.language)
      const success = await this.sendOrQueue(message, 'series', imageSource, items.length, group.groupId, fallbackImageUrl)
      if (success) anySuccess = true
      logger.info('Notification', `Series notification to "${group.groupName}" (${group.language}): ${success ? 'sent' : 'queued'}`, { groupId: group.groupId, success })
    }

    return anySuccess
  }

  /**
   * Format and send a removed notification (movies or series) to all configured groups.
   * Text-only (no cover image for removals).
   */
  async sendRemovedNotification(type: 'movies-removed' | 'series-removed', items: MediaEvent[]): Promise<boolean> {
    if (items.length === 0) return false

    const groups = settingsService.getWhatsAppGroups()
    if (groups.length === 0) {
      logger.warn('Notification', 'No WhatsApp groups configured, skipping removed notification')
      return false
    }

    const mediaType: MediaType = type === 'movies-removed' ? 'movie' : 'series'
    let anySuccess = false

    for (const group of groups) {
      const message = messageFormatter.formatMessage(type, items, group.language)
      const success = await this.sendOrQueue(message, mediaType, undefined, items.length, group.groupId)
      if (success) anySuccess = true
      logger.info('Notification', `${type} notification to "${group.groupName}" (${group.language}): ${success ? 'sent' : 'queued'}`, { groupId: group.groupId, success })
    }

    return anySuccess
  }

  /**
   * Send message directly if connected, otherwise queue it.
   * Schedules retry with exponential backoff on failure.
   * Records notification in status service for tracking.
   *
   * @param imageSource - URL string or Buffer for direct send
   * @param fallbackImageUrl - URL to store in queue when imageSource is a Buffer (Buffers can't be persisted in SQLite)
   */
  private async sendOrQueue(message: string, mediaType: MediaType, imageSource?: string | Buffer, itemCount = 1, groupId?: string, fallbackImageUrl?: string): Promise<boolean> {
    const notificationType = mediaType === 'movie' ? 'movies' : 'series'
    const targetGroupId = groupId || settingsService.getWhatsAppGroupId()

    if (!targetGroupId) {
      logger.warn('Notification', 'WhatsApp group ID not configured, skipping notification')
      return false
    }

    // For queuing, we need a URL string (Buffers can't be stored in SQLite)
    const queueImageUrl = typeof imageSource === 'string' ? imageSource : fallbackImageUrl

    if (!whatsappClient.isConnected()) {
      logger.info('Notification', `WhatsApp disconnected, queuing ${mediaType} notification`, { mediaType })
      queueService.addMessage(message, mediaType, queueImageUrl)
      statusService.recordNotification(notificationType, itemCount, false)
      // Will be processed on reconnection by retryService
      return false
    }

    logger.info('Notification', `Sending ${mediaType} notification${imageSource ? ' with cover' : ''}`, { mediaType, hasImage: !!imageSource, groupId: targetGroupId })

    let success: boolean
    if (imageSource) {
      success = await whatsappClient.sendImageMessage(targetGroupId, imageSource, message)
    } else {
      success = await whatsappClient.sendTextMessage(targetGroupId, message)
    }

    if (!success) {
      logger.warn('Notification', `Failed to send ${mediaType} notification, queuing for retry`, { mediaType })
      const messageId = queueService.addMessage(message, mediaType, queueImageUrl)
      retryService.scheduleRetry(messageId)
    } else {
      logger.info('Notification', `Successfully sent ${mediaType} notification`, { mediaType, groupId: targetGroupId })
    }

    statusService.recordNotification(notificationType, itemCount, success)
    return success
  }

  /**
   * Send a queued message by ID.
   * Returns true if sent successfully, false otherwise.
   * Note: Queued messages are already formatted, so they're sent to the first configured group.
   */
  async sendQueuedMessage(messageId: number): Promise<boolean> {
    const msg = queueService.getMessage(messageId)
    if (!msg) {
      logger.warn('Notification', `Queued message ${messageId} not found`, { messageId })
      return false
    }

    const groups = settingsService.getWhatsAppGroups()
    if (groups.length === 0) {
      logger.warn('Notification', 'No WhatsApp groups configured, cannot send queued message')
      return false
    }

    if (!whatsappClient.isConnected()) {
      logger.info('Notification', `WhatsApp disconnected, cannot send queued message ${messageId}`, { messageId })
      return false
    }

    // Send to all configured groups
    let anySuccess = false
    for (const group of groups) {
      let success: boolean
      if (msg.imageUrl) {
        success = await whatsappClient.sendImageMessage(group.groupId, msg.imageUrl, msg.content)
      } else {
        success = await whatsappClient.sendTextMessage(group.groupId, msg.content)
      }
      if (success) anySuccess = true
    }

    if (anySuccess) {
      queueService.updateStatus(messageId, 'sent')
      queueService.removeMessage(messageId)
    }

    return anySuccess
  }
}

// Singleton instance
export const notificationService = new NotificationService()
