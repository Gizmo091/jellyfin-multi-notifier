import type { ChannelType } from '../../types/index.js'
import type { ChannelSender } from './types.js'
import { whatsappSender } from './whatsapp.js'
import { discordSender } from './discord.js'
import { telegramSender } from './telegram.js'

export type { ChannelSender, SendResult, DiscordEmbed } from './types.js'

/**
 * Registry of channel senders by type.
 */
const senders: Record<ChannelType, ChannelSender> = {
  whatsapp: whatsappSender,
  discord: discordSender,
  telegram: telegramSender,
}

/**
 * Get the sender for a specific channel type.
 */
export function getSender(channelType: ChannelType): ChannelSender {
  const sender = senders[channelType]
  if (!sender) {
    throw new Error(`Unknown channel type: ${channelType}`)
  }
  return sender
}

export { whatsappSender, discordSender, telegramSender }
