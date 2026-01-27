import { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import type { ApiResponse } from '../types/index.js'

interface ConfigStatus {
  jellyfinUrl: string
  whatsappGroupId: string
  aggregationWindowMinutes: number
  publicUrl: string
  alerts: {
    emailConfigured: boolean
    telegramConfigured: boolean
    discordConfigured: boolean
  }
}

/**
 * Config routes for viewing current configuration.
 */
export async function configRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/config
   * Returns the current configuration status (no secrets).
   */
  fastify.get('/api/config', async (): Promise<ApiResponse<ConfigStatus>> => {
    return {
      success: true,
      data: {
        jellyfinUrl: config.jellyfinUrl,
        whatsappGroupId: config.whatsappGroupId || '(not configured)',
        aggregationWindowMinutes: config.aggregationWindowMinutes,
        publicUrl: config.publicUrl,
        alerts: {
          emailConfigured: !!(config.smtpHost && config.alertEmail),
          telegramConfigured: !!(config.telegramBotToken && config.telegramChatId),
          discordConfigured: !!config.discordWebhookUrl,
        },
      },
    }
  })
}
