import type { NotificationChannel } from '../../types/index.js'

export interface SendResult {
  success: boolean
  error?: string
}

export interface DiscordEmbed {
  title?: string
  description?: string
  color?: number
  image?: { url: string }
  thumbnail?: { url: string }
  timestamp?: string
}

export interface ChannelSender {
  /**
   * Send a notification to a channel.
   * @param channel The notification channel configuration
   * @param text The text content of the message
   * @param imageBuffer Optional image buffer for inline images
   * @param imageUrl Optional image URL (used when buffer not available or for embeds)
   */
  send(
    channel: NotificationChannel,
    text: string,
    imageBuffer?: Buffer,
    imageUrl?: string
  ): Promise<SendResult>

  /**
   * Check if the sender is available to send messages.
   * For stateless senders (HTTP-based), this always returns true.
   * For stateful senders (WebSocket-based like WhatsApp), this checks connection status.
   */
  isAvailable(channel: NotificationChannel): boolean
}
