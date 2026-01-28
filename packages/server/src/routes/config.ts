import { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import { settingsService } from '../services/settings/index.js'
import type { ApiResponse } from '../types/index.js'

interface ConfigStatus {
  jellyfinUrl: string
  whatsappGroupId: string | null
  aggregationWindowMinutes: number
  publicUrl: string
  alerts: {
    emailConfigured: boolean
    telegramConfigured: boolean
    discordConfigured: boolean
  }
}

interface SetWhatsAppGroupBody {
  groupId: string
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
        whatsappGroupId: settingsService.getWhatsAppGroupId(),
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

  /**
   * POST /api/config/whatsapp-group
   * Sets the target WhatsApp group ID.
   */
  fastify.post<{ Body: SetWhatsAppGroupBody }>(
    '/api/config/whatsapp-group',
    {
      schema: {
        body: {
          type: 'object',
          required: ['groupId'],
          properties: {
            groupId: {
              type: 'string',
              minLength: 1,
              description: 'WhatsApp group ID',
            },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<{ groupId: string }>> => {
      const { groupId } = request.body

      if (!groupId || groupId.trim().length === 0) {
        return {
          success: false,
          error: 'Group ID is required',
        }
      }

      settingsService.setWhatsAppGroupId(groupId.trim())

      fastify.log.info({ groupId }, 'WhatsApp target group updated')

      return {
        success: true,
        data: {
          groupId: groupId.trim(),
        },
      }
    }
  )
}
