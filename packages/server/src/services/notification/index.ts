import { MediaEvent, MediaType, NotificationChannel, SupportedLanguage } from '../../types/index.js'
import { aggregationService } from '../aggregation/index.js'
import { queueService } from '../queue/index.js'
import { retryService } from '../retry/index.js'
import { statusService } from '../status/index.js'
import { settingsService } from '../settings/index.js'
import { messageFormatter } from '../message-formatter/index.js'
import { coverService } from '../cover/index.js'
import { logger } from '../logger/index.js'
import { getSender } from '../senders/index.js'

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
   * Format and send a movies notification to all configured channels.
   * Each channel receives the message in its configured language and format.
   * Creates a composite patchwork image when multiple covers are available.
   */
  async sendMoviesNotification(items: MediaEvent[]): Promise<boolean> {
    if (items.length === 0) {
      logger.debug('Notification', 'No movies to notify')
      return false
    }

    return this.sendToAllChannels('movies', items)
  }

  /**
   * Format and send a series notification to all configured channels.
   * Each channel receives the message in its configured language and format.
   * Creates a composite patchwork image when multiple covers are available.
   */
  async sendSeriesNotification(items: MediaEvent[]): Promise<boolean> {
    if (items.length === 0) {
      logger.debug('Notification', 'No series to notify')
      return false
    }

    return this.sendToAllChannels('series', items)
  }

  /**
   * Format and send a removed notification (movies or series) to all configured channels.
   * Text-only (no cover image for removals).
   */
  async sendRemovedNotification(type: 'movies-removed' | 'series-removed', items: MediaEvent[]): Promise<boolean> {
    if (items.length === 0) return false

    return this.sendToAllChannels(type, items)
  }

  /**
   * Core method to send notifications to all enabled channels.
   * Handles image preparation, language grouping, and per-channel dispatch.
   */
  private async sendToAllChannels(
    type: 'movies' | 'series' | 'movies-removed' | 'series-removed',
    items: MediaEvent[]
  ): Promise<boolean> {
    const channels = settingsService.getNotificationChannels().filter(c => c.enabled)
    if (channels.length === 0) {
      logger.warn('Notification', 'No notification channels configured, skipping notification')
      return false
    }

    // Prepare image for non-removal notifications
    let imageBuffer: Buffer | undefined
    let imageUrl: string | undefined

    if (type === 'movies' || type === 'series') {
      const coverUrls = items.map((i) => i.coverUrl).filter((url): url is string => !!url)

      if (coverUrls.length >= 2) {
        const composite = await coverService.createCompositeImage(coverUrls)
        if (composite) {
          imageBuffer = composite
          imageUrl = coverUrls[0] // Fallback URL for queue storage
        } else {
          imageUrl = coverUrls[0]
        }
      } else if (coverUrls.length === 1) {
        imageUrl = coverUrls[0]
      }
    }

    const mediaType: MediaType = (type === 'movies' || type === 'movies-removed') ? 'movie' : 'series'
    const notificationType = mediaType === 'movie' ? 'movies' : 'series'
    let anySuccess = false

    // Group channels by language for efficient formatting
    const channelsByLanguage = new Map<SupportedLanguage, NotificationChannel[]>()
    for (const channel of channels) {
      const list = channelsByLanguage.get(channel.language) || []
      list.push(channel)
      channelsByLanguage.set(channel.language, list)
    }

    for (const [language, langChannels] of channelsByLanguage) {
      for (const channel of langChannels) {
        const { text } = messageFormatter.formatForPlatform(type, items, language, channel.channelType)
        const sender = getSender(channel.channelType)

        if (!sender.isAvailable(channel)) {
          // Queue the message for later (only for WhatsApp which has stateful connection)
          logger.info('Notification', `Channel ${channel.displayName} not available, queuing message`, { channelId: channel.id, channelType: channel.channelType })
          queueService.addMessage(text, mediaType, imageUrl, channel.id, channel.channelType)
          statusService.recordNotification(notificationType, items.length, false)
          continue
        }

        const result = await sender.send(channel, text, imageBuffer, imageUrl)

        if (result.success) {
          anySuccess = true
          logger.info('Notification', `${type} notification sent to "${channel.displayName}" (${channel.channelType}, ${language})`, { channelId: channel.id, success: true })
        } else {
          logger.warn('Notification', `Failed to send ${type} notification to "${channel.displayName}"`, { channelId: channel.id, error: result.error })
          // Queue for retry (if WhatsApp)
          if (channel.channelType === 'whatsapp') {
            const messageId = queueService.addMessage(text, mediaType, imageUrl, channel.id, channel.channelType)
            retryService.scheduleRetry(messageId)
          }
        }

        statusService.recordNotification(notificationType, items.length, result.success)
      }
    }

    return anySuccess
  }

  /**
   * Send a test notification to a specific channel.
   * Used for testing channel configuration from the admin UI.
   */
  async sendTestNotification(channelId: string): Promise<{ success: boolean; error?: string }> {
    const channel = settingsService.getNotificationChannel(channelId)
    if (!channel) {
      return { success: false, error: 'Channel not found' }
    }

    const sender = getSender(channel.channelType)

    if (!sender.isAvailable(channel)) {
      return { success: false, error: `${channel.channelType} sender is not available` }
    }

    // Create a test message
    const testMessage = messageFormatter.formatForPlatform(
      'movies',
      [{
        id: 'test-123',
        type: 'movie',
        title: 'Test Movie',
        year: 2024,
        jellyfinId: 'test-jellyfin-id',
        eventType: 'added',
        timestamp: new Date(),
      }],
      channel.language,
      channel.channelType
    )

    const result = await sender.send(channel, testMessage.text)
    return result
  }

  /**
   * Send a queued message by ID.
   * Returns true if sent successfully, false otherwise.
   * If the message has a channel_id, sends to that specific channel.
   * Otherwise, sends to all enabled channels of the matching type.
   */
  async sendQueuedMessage(messageId: number): Promise<boolean> {
    const msg = queueService.getMessage(messageId)
    if (!msg) {
      logger.warn('Notification', `Queued message ${messageId} not found`, { messageId })
      return false
    }

    // If the message has a specific channel, send to that channel
    if (msg.channelId && msg.channelType) {
      const channel = settingsService.getNotificationChannel(msg.channelId)
      if (!channel) {
        logger.warn('Notification', `Channel ${msg.channelId} not found for queued message ${messageId}`, { messageId, channelId: msg.channelId })
        return false
      }

      const sender = getSender(channel.channelType)
      if (!sender.isAvailable(channel)) {
        logger.info('Notification', `Channel ${channel.displayName} not available, cannot send queued message ${messageId}`, { messageId, channelId: channel.id })
        return false
      }

      const result = await sender.send(channel, msg.content, undefined, msg.imageUrl || undefined)
      if (result.success) {
        queueService.updateStatus(messageId, 'sent')
        queueService.removeMessage(messageId)
        return true
      }
      return false
    }

    // Legacy behavior: send to all WhatsApp channels (for old queued messages)
    const channels = settingsService.getNotificationChannels().filter(
      c => c.enabled && c.channelType === 'whatsapp'
    )

    if (channels.length === 0) {
      logger.warn('Notification', 'No WhatsApp channels configured, cannot send queued message')
      return false
    }

    let anySuccess = false
    for (const channel of channels) {
      const sender = getSender(channel.channelType)
      if (!sender.isAvailable(channel)) {
        continue
      }

      const result = await sender.send(channel, msg.content, undefined, msg.imageUrl || undefined)
      if (result.success) anySuccess = true
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
