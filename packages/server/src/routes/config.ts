import { FastifyInstance } from 'fastify'
import { randomUUID } from 'crypto'
import { config } from '../config.js'
import { settingsService, type WhatsAppGroupConfig, type SupportedLanguage } from '../services/settings/index.js'
import { aggregationService } from '../services/aggregation/index.js'
import { messageFormatter } from '../services/message-formatter/index.js'
import type { ApiResponse, MediaEvent } from '../types/index.js'

interface ConfigStatus {
  jellyfinUrl: string
  whatsappGroupId: string | null // Deprecated, kept for backwards compatibility
  whatsappGroups: WhatsAppGroupConfig[]
  supportedLanguages: { code: string; name: string }[]
  aggregationWindowMinutes: number
  publicUrl: string
  alerts: {
    emailConfigured: boolean
    telegramConfigured: boolean
    discordConfigured: boolean
  }
}

interface WebhookConfig {
  webhookUrl: string
  webhookSecret: string
  secretConfigured: boolean
  template: string
  notificationTypes: string[]
}

interface SetWhatsAppGroupBody {
  groupId: string
}

interface TestWebhookBody {
  type: 'movie' | 'series'
  title?: string
  year?: number
  flushImmediately?: boolean
}

interface AddWhatsAppGroupBody {
  groupId: string
  groupName: string
  language: SupportedLanguage
}

interface UpdateWhatsAppGroupBody {
  groupName?: string
  language?: SupportedLanguage
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
        whatsappGroupId: settingsService.getWhatsAppGroupId(), // Deprecated
        whatsappGroups: settingsService.getWhatsAppGroups(),
        supportedLanguages: messageFormatter.getSupportedLanguages(),
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

  /**
   * GET /api/config/webhook
   * Returns the webhook configuration for Jellyfin setup.
   */
  fastify.get('/api/config/webhook', async (): Promise<ApiResponse<WebhookConfig>> => {
    const webhookUrl = `${config.publicUrl.replace(/\/$/, '')}/webhook/jellyfin`

    // Jellyfin Webhook plugin template - includes all fields needed for notification
    const template = JSON.stringify({
      NotificationType: '{{NotificationType}}',
      ServerId: '{{ServerId}}',
      ServerName: '{{ServerName}}',
      ServerUrl: '{{ServerUrl}}',
      Item: {
        Id: '{{ItemId}}',
        Name: '{{Name}}',
        Type: '{{ItemType}}',
        ProductionYear: '{{Year}}',
        SeriesName: '{{SeriesName}}',
        SeasonName: '{{SeasonName}}',
        IndexNumber: '{{EpisodeNumber}}',
        ParentIndexNumber: '{{SeasonNumber}}',
        ImageTags: {
          Primary: '{{PrimaryImageTag}}'
        }
      }
    }, null, 2)

    return {
      success: true,
      data: {
        webhookUrl,
        webhookSecret: config.webhookSecret,
        secretConfigured: !!config.webhookSecret,
        template,
        notificationTypes: ['ItemAdded', 'ItemRemoved'],
      },
    }
  })

  /**
   * POST /api/test/webhook
   * Simulates a Jellyfin webhook for testing the notification flow.
   */
  fastify.post<{ Body: TestWebhookBody }>(
    '/api/test/webhook',
    {
      schema: {
        body: {
          type: 'object',
          required: ['type'],
          properties: {
            type: {
              type: 'string',
              enum: ['movie', 'series'],
              description: 'Type of media to simulate',
            },
            title: {
              type: 'string',
              description: 'Custom title (optional)',
            },
            year: {
              type: 'number',
              description: 'Production year (optional)',
            },
            flushImmediately: {
              type: 'boolean',
              default: true,
              description: 'Send notification immediately without waiting for aggregation window',
            },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<{ event: MediaEvent; flushed: boolean }>> => {
      const { type, title, year, flushImmediately = true } = request.body

      // Generate test media event with realistic data
      const testMovies = [
        { title: 'The Matrix', year: 1999 },
        { title: 'Inception', year: 2010 },
        { title: 'Interstellar', year: 2014 },
        { title: 'Dune', year: 2021 },
        { title: 'Avatar', year: 2009 },
      ]
      const testSeries = [
        { title: 'Breaking Bad S01E01', year: 2008 },
        { title: 'Game of Thrones S01E01', year: 2011 },
        { title: 'Stranger Things S01E01', year: 2016 },
      ]

      const testData = type === 'movie' ? testMovies : testSeries
      const randomItem = testData[Math.floor(Math.random() * testData.length)]

      const event: MediaEvent = {
        id: randomUUID(),
        type: type === 'movie' ? 'movie' : 'episode',
        title: title || `[TEST] ${randomItem.title}`,
        year: year || randomItem.year,
        jellyfinId: `test-${randomUUID().slice(0, 8)}`,
        eventType: 'added',
        timestamp: new Date(),
      }

      fastify.log.info({ event }, 'Test webhook: simulating media event')

      // Add to aggregation service
      aggregationService.addMedia(event)

      // Optionally flush immediately for instant testing
      if (flushImmediately) {
        fastify.log.info('Test webhook: flushing aggregation immediately')
        aggregationService.flushAll()
      }

      return {
        success: true,
        data: {
          event,
          flushed: flushImmediately,
        },
      }
    }
  )

  /**
   * GET /api/config/whatsapp-groups
   * Returns all configured WhatsApp groups with their languages.
   */
  fastify.get('/api/config/whatsapp-groups', async (): Promise<ApiResponse<{ groups: WhatsAppGroupConfig[] }>> => {
    return {
      success: true,
      data: {
        groups: settingsService.getWhatsAppGroups(),
      },
    }
  })

  /**
   * POST /api/config/whatsapp-groups
   * Adds a new WhatsApp group with language configuration.
   */
  fastify.post<{ Body: AddWhatsAppGroupBody }>(
    '/api/config/whatsapp-groups',
    {
      schema: {
        body: {
          type: 'object',
          required: ['groupId', 'groupName', 'language'],
          properties: {
            groupId: {
              type: 'string',
              minLength: 1,
              description: 'WhatsApp group ID',
            },
            groupName: {
              type: 'string',
              minLength: 1,
              description: 'Display name for the group',
            },
            language: {
              type: 'string',
              enum: ['fr', 'en', 'es', 'de', 'it', 'pt'],
              description: 'Language for notifications to this group',
            },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<WhatsAppGroupConfig>> => {
      const { groupId, groupName, language } = request.body

      const group = settingsService.addWhatsAppGroup(groupId, groupName, language)

      fastify.log.info({ group }, 'WhatsApp group added')

      return {
        success: true,
        data: group,
      }
    }
  )

  /**
   * PUT /api/config/whatsapp-groups/:id
   * Updates an existing WhatsApp group configuration.
   */
  fastify.put<{ Params: { id: string }; Body: UpdateWhatsAppGroupBody }>(
    '/api/config/whatsapp-groups/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            groupName: {
              type: 'string',
              minLength: 1,
            },
            language: {
              type: 'string',
              enum: ['fr', 'en', 'es', 'de', 'it', 'pt'],
            },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<{ message: string }>> => {
      const { id } = request.params
      const updates = request.body

      settingsService.updateWhatsAppGroup(id, updates)

      fastify.log.info({ id, updates }, 'WhatsApp group updated')

      return {
        success: true,
        data: {
          message: 'Group updated successfully',
        },
      }
    }
  )

  /**
   * DELETE /api/config/whatsapp-groups/:id
   * Removes a WhatsApp group from configuration.
   */
  fastify.delete<{ Params: { id: string } }>(
    '/api/config/whatsapp-groups/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<{ message: string }>> => {
      const { id } = request.params

      settingsService.removeWhatsAppGroup(id)

      fastify.log.info({ id }, 'WhatsApp group removed')

      return {
        success: true,
        data: {
          message: 'Group removed successfully',
        },
      }
    }
  )
}
