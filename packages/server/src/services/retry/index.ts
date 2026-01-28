import { EventEmitter } from 'events'
import { queueService, QueueMessage } from '../queue/index.js'
import { whatsappClient } from '../whatsapp/client.js'
import { settingsService } from '../settings/index.js'

/**
 * Retry service for managing automatic message retry with exponential backoff.
 * NFR17: Retry up to 5 times with exponential backoff.
 */
class RetryService extends EventEmitter {
  private readonly MAX_RETRIES = 5
  private readonly BASE_DELAY_MS = 60000 // 1 minute
  private readonly MAX_DELAY_MS = 16 * 60000 // 16 minutes max
  private pendingRetries: Map<number, NodeJS.Timeout> = new Map()
  private initialized = false

  /**
   * Initialize retry service - listen for WhatsApp connection events.
   */
  initialize(): void {
    if (this.initialized) {
      console.log('RetryService already initialized')
      return
    }

    // When WhatsApp connects, process pending messages
    whatsappClient.on('connected', () => {
      console.log('WhatsApp connected - processing pending queue')
      this.processAllPending()
    })

    this.initialized = true
    console.log('RetryService initialized')
  }

  /**
   * Calculate exponential backoff delay for a given retry count.
   * Formula: baseDelay * 2^(retryCount - 1), capped at MAX_DELAY_MS
   */
  calculateDelay(retryCount: number): number {
    const delay = this.BASE_DELAY_MS * Math.pow(2, retryCount - 1)
    return Math.min(delay, this.MAX_DELAY_MS)
  }

  /**
   * Schedule a retry for a specific message.
   */
  scheduleRetry(messageId: number): void {
    const message = queueService.getMessage(messageId)
    if (!message) {
      console.warn(`Cannot schedule retry: message ${messageId} not found`)
      return
    }

    // Cancel any existing retry timer for this message
    this.cancelRetry(messageId)

    // Increment retry count
    const newRetryCount = queueService.incrementRetryCount(messageId)

    if (newRetryCount > this.MAX_RETRIES) {
      console.log(`Message ${messageId} exceeded max retries (${this.MAX_RETRIES}), marking as failed`)
      queueService.updateStatus(messageId, 'failed')
      this.emit('message-failed', { messageId, retryCount: newRetryCount })
      return
    }

    const delay = this.calculateDelay(newRetryCount)
    console.log(`Scheduling retry ${newRetryCount}/${this.MAX_RETRIES} for message ${messageId} in ${delay / 1000}s`)

    const timer = setTimeout(() => {
      this.pendingRetries.delete(messageId)
      this.executeRetry(messageId)
    }, delay)

    this.pendingRetries.set(messageId, timer)
  }

  /**
   * Execute a retry attempt for a message.
   */
  private async executeRetry(messageId: number): Promise<void> {
    const message = queueService.getMessage(messageId)
    if (!message) {
      console.warn(`Cannot execute retry: message ${messageId} not found`)
      return
    }

    if (message.status !== 'pending') {
      console.log(`Message ${messageId} no longer pending (status: ${message.status}), skipping retry`)
      return
    }

    if (!whatsappClient.isConnected()) {
      console.log(`WhatsApp disconnected, rescheduling retry for message ${messageId}`)
      // Don't increment retry count, just reschedule
      const delay = this.calculateDelay(message.retryCount)
      const timer = setTimeout(() => {
        this.pendingRetries.delete(messageId)
        this.executeRetry(messageId)
      }, delay)
      this.pendingRetries.set(messageId, timer)
      return
    }

    console.log(`Executing retry for message ${messageId} (attempt ${message.retryCount})`)

    const groupId = settingsService.getWhatsAppGroupId()
    if (!groupId) {
      console.warn('WhatsApp group ID not configured, cannot retry')
      return
    }

    let success: boolean
    if (message.imageUrl) {
      success = await whatsappClient.sendImageMessage(
        groupId,
        message.imageUrl,
        message.content
      )
    } else {
      success = await whatsappClient.sendTextMessage(groupId, message.content)
    }

    if (success) {
      console.log(`Retry successful for message ${messageId}`)
      queueService.updateStatus(messageId, 'sent')
      queueService.removeMessage(messageId)
      this.emit('retry-success', { messageId })
    } else {
      console.log(`Retry failed for message ${messageId}`)
      this.scheduleRetry(messageId)
    }
  }

  /**
   * Cancel a pending retry for a message.
   */
  cancelRetry(messageId: number): void {
    const timer = this.pendingRetries.get(messageId)
    if (timer) {
      clearTimeout(timer)
      this.pendingRetries.delete(messageId)
      console.log(`Cancelled pending retry for message ${messageId}`)
    }
  }

  /**
   * Cancel all pending retries.
   */
  cancelAllRetries(): void {
    for (const [messageId, timer] of this.pendingRetries) {
      clearTimeout(timer)
      console.log(`Cancelled retry for message ${messageId}`)
    }
    this.pendingRetries.clear()
    console.log('All pending retries cancelled')
  }

  /**
   * Process all pending messages immediately (e.g., on reconnection).
   */
  async processAllPending(): Promise<void> {
    const pendingMessages = queueService.getPendingMessages()

    if (pendingMessages.length === 0) {
      console.log('No pending messages to process')
      return
    }

    console.log(`Processing ${pendingMessages.length} pending messages`)

    // Process messages with a small delay between each to avoid rate limiting
    for (const message of pendingMessages) {
      // Skip if already scheduled
      if (this.pendingRetries.has(message.id)) {
        continue
      }

      await this.processMessage(message)

      // Small delay between messages (500ms)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  /**
   * Process a single message from the queue.
   */
  private async processMessage(message: QueueMessage): Promise<void> {
    if (!whatsappClient.isConnected()) {
      console.log(`WhatsApp disconnected, cannot process message ${message.id}`)
      return
    }

    console.log(`Processing queued message ${message.id} (retry count: ${message.retryCount})`)

    const groupId = settingsService.getWhatsAppGroupId()
    if (!groupId) {
      console.warn('WhatsApp group ID not configured, cannot process message')
      return
    }

    let success: boolean
    if (message.imageUrl) {
      success = await whatsappClient.sendImageMessage(
        groupId,
        message.imageUrl,
        message.content
      )
    } else {
      success = await whatsappClient.sendTextMessage(groupId, message.content)
    }

    if (success) {
      console.log(`Message ${message.id} sent successfully`)
      queueService.updateStatus(message.id, 'sent')
      queueService.removeMessage(message.id)
    } else {
      console.log(`Message ${message.id} failed, scheduling retry`)
      this.scheduleRetry(message.id)
    }
  }

  /**
   * Get the number of pending retries.
   */
  getPendingRetryCount(): number {
    return this.pendingRetries.size
  }

  /**
   * Get IDs of messages with pending retries.
   */
  getPendingRetryIds(): number[] {
    return Array.from(this.pendingRetries.keys())
  }
}

// Singleton instance
export const retryService = new RetryService()
