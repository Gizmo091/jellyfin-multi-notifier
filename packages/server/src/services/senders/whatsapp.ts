import type { NotificationChannel } from '../../types/index.js'
import type { ChannelSender, SendResult } from './types.js'
import { whatsappClient } from '../whatsapp/client.js'

/**
 * WhatsApp sender - wraps the existing whatsappClient.
 */
export const whatsappSender: ChannelSender = {
  async send(
    channel: NotificationChannel,
    text: string,
    imageBuffer?: Buffer,
    imageUrl?: string
  ): Promise<SendResult> {
    const imageSource = imageBuffer || imageUrl

    let success: boolean
    if (imageSource) {
      success = await whatsappClient.sendImageMessage(channel.target, imageSource, text)
    } else {
      success = await whatsappClient.sendTextMessage(channel.target, text)
    }

    return {
      success,
      error: success ? undefined : 'Failed to send WhatsApp message',
    }
  },

  isAvailable(): boolean {
    return whatsappClient.isConnected()
  },
}
