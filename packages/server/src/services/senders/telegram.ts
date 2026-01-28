import type { NotificationChannel } from '../../types/index.js'
import type { ChannelSender, SendResult } from './types.js'
import { logger } from '../logger/index.js'

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

/**
 * Telegram sender - sends messages via Bot API.
 * Supports text (HTML formatted) and images with captions.
 */
export const telegramSender: ChannelSender = {
  async send(
    channel: NotificationChannel,
    text: string,
    imageBuffer?: Buffer,
    imageUrl?: string
  ): Promise<SendResult> {
    const chatId = channel.target
    const botToken = channel.config?.telegramBotToken

    if (!botToken) {
      logger.error('Telegram', `No bot token configured for channel ${channel.displayName}`)
      return { success: false, error: 'No Telegram bot token configured' }
    }

    try {
      if (imageBuffer) {
        // Send photo with caption via multipart/form-data
        const formData = new FormData()
        formData.append('chat_id', chatId)
        formData.append('caption', text)
        formData.append('parse_mode', 'HTML')
        formData.append(
          'photo',
          new Blob([imageBuffer], { type: 'image/jpeg' }),
          'media.jpg'
        )

        const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendPhoto`, {
          method: 'POST',
          body: formData,
        })

        const result = await response.json() as { ok: boolean; description?: string }

        if (!result.ok) {
          logger.error('Telegram', `sendPhoto failed`, { error: result.description })
          return { success: false, error: result.description || 'sendPhoto failed' }
        }
      } else if (imageUrl) {
        // Send photo with URL
        const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: imageUrl,
            caption: text,
            parse_mode: 'HTML',
          }),
        })

        const result = await response.json() as { ok: boolean; description?: string }

        if (!result.ok) {
          logger.error('Telegram', `sendPhoto failed`, { error: result.description })
          return { success: false, error: result.description || 'sendPhoto failed' }
        }
      } else {
        // Send text-only message
        const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
          }),
        })

        const result = await response.json() as { ok: boolean; description?: string }

        if (!result.ok) {
          logger.error('Telegram', `sendMessage failed`, { error: result.description })
          return { success: false, error: result.description || 'sendMessage failed' }
        }
      }

      logger.info('Telegram', `Message sent to channel ${channel.displayName}`)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Telegram', `Failed to send message`, { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  },

  isAvailable(): boolean {
    // HTTP-based, always available
    return true
  },
}
