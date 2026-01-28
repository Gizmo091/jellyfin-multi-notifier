import type { NotificationChannel } from '../../types/index.js'
import type { ChannelSender, SendResult, DiscordEmbed } from './types.js'
import { logger } from '../logger/index.js'

/**
 * Discord sender - sends messages via webhook.
 * Supports text, embeds, and image attachments.
 */
export const discordSender: ChannelSender = {
  async send(
    channel: NotificationChannel,
    text: string,
    imageBuffer?: Buffer,
    imageUrl?: string
  ): Promise<SendResult> {
    const webhookUrl = channel.target

    try {
      if (imageBuffer) {
        // Send with image attachment via multipart/form-data
        const formData = new FormData()

        // Create the payload with embed pointing to attachment
        const payload: { content?: string; embeds: DiscordEmbed[] } = {
          embeds: [
            {
              description: text,
              color: 0x00a4dc, // Jellyfin blue
              image: { url: 'attachment://media.jpg' },
            },
          ],
        }

        formData.append('payload_json', JSON.stringify(payload))
        formData.append(
          'files[0]',
          new Blob([imageBuffer], { type: 'image/jpeg' }),
          'media.jpg'
        )

        const response = await fetch(webhookUrl, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorText = await response.text()
          logger.error('Discord', `Webhook failed: ${response.status}`, { status: response.status, error: errorText })
          return { success: false, error: `Discord webhook failed: ${response.status}` }
        }
      } else if (imageUrl) {
        // Send with embed containing image URL
        const payload: { embeds: DiscordEmbed[] } = {
          embeds: [
            {
              description: text,
              color: 0x00a4dc, // Jellyfin blue
              image: { url: imageUrl },
            },
          ],
        }

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errorText = await response.text()
          logger.error('Discord', `Webhook failed: ${response.status}`, { status: response.status, error: errorText })
          return { success: false, error: `Discord webhook failed: ${response.status}` }
        }
      } else {
        // Send text-only message
        const payload = { content: text }

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errorText = await response.text()
          logger.error('Discord', `Webhook failed: ${response.status}`, { status: response.status, error: errorText })
          return { success: false, error: `Discord webhook failed: ${response.status}` }
        }
      }

      logger.info('Discord', `Message sent to channel ${channel.displayName}`)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Discord', `Failed to send message`, { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  },

  isAvailable(): boolean {
    // HTTP-based, always available
    return true
  },
}
