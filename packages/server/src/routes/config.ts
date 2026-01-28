import { FastifyInstance } from 'fastify'
import { randomUUID } from 'crypto'
import { config, type AggregationWindows } from '../config.js'
import { settingsService, type WhatsAppGroupConfig } from '../services/settings/index.js'
import { aggregationService } from '../services/aggregation/index.js'
import { messageFormatter } from '../services/message-formatter/index.js'
import { notificationService } from '../services/notification/index.js'
import { getSender } from '../services/senders/index.js'
import type { ApiResponse, MediaEvent, NotificationChannel, ChannelType, SupportedLanguage } from '../types/index.js'

interface ConfigStatus {
  jellyfinUrl: string
  whatsappGroupId: string | null // Deprecated, kept for backwards compatibility
  whatsappGroups: WhatsAppGroupConfig[]
  notificationChannels: NotificationChannel[]
  supportedLanguages: { code: string; name: string }[]
  aggregationWindowMinutes: AggregationWindows
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

interface AddNotificationChannelBody {
  channelType: ChannelType
  target: string
  displayName: string
  language: SupportedLanguage
  config?: { telegramBotToken?: string }
}

interface UpdateNotificationChannelBody {
  displayName?: string
  language?: SupportedLanguage
  config?: { telegramBotToken?: string }
}

interface ToggleNotificationChannelBody {
  enabled: boolean
}

interface TestChannelConfigBody {
  channelType: ChannelType
  target: string
  language: SupportedLanguage
  config?: { telegramBotToken?: string }
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
        notificationChannels: settingsService.getNotificationChannels(),
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

  // =============================================
  // Notification Channels (multi-platform)
  // =============================================

  /**
   * GET /api/config/notification-channels
   * Returns all configured notification channels.
   */
  fastify.get('/api/config/notification-channels', async (): Promise<ApiResponse<{ channels: NotificationChannel[] }>> => {
    return {
      success: true,
      data: {
        channels: settingsService.getNotificationChannels(),
      },
    }
  })

  /**
   * POST /api/config/notification-channels
   * Adds a new notification channel.
   */
  fastify.post<{ Body: AddNotificationChannelBody }>(
    '/api/config/notification-channels',
    {
      schema: {
        body: {
          type: 'object',
          required: ['channelType', 'target', 'displayName', 'language'],
          properties: {
            channelType: {
              type: 'string',
              enum: ['whatsapp', 'discord', 'telegram'],
              description: 'Type of notification channel',
            },
            target: {
              type: 'string',
              minLength: 1,
              description: 'Target identifier (group_id, webhook_url, or chat_id)',
            },
            displayName: {
              type: 'string',
              minLength: 1,
              description: 'Display name for the channel',
            },
            language: {
              type: 'string',
              enum: ['fr', 'en', 'es', 'de', 'it', 'pt'],
              description: 'Language for notifications',
            },
            config: {
              type: 'object',
              properties: {
                telegramBotToken: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<NotificationChannel>> => {
      const { channelType, target, displayName, language, config: channelConfig } = request.body

      const channel = settingsService.addNotificationChannel(
        channelType,
        target,
        displayName,
        language,
        channelConfig
      )

      fastify.log.info({ channel }, 'Notification channel added')

      return {
        success: true,
        data: channel,
      }
    }
  )

  /**
   * PUT /api/config/notification-channels/:id
   * Updates an existing notification channel.
   */
  fastify.put<{ Params: { id: string }; Body: UpdateNotificationChannelBody }>(
    '/api/config/notification-channels/:id',
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
            displayName: {
              type: 'string',
              minLength: 1,
            },
            language: {
              type: 'string',
              enum: ['fr', 'en', 'es', 'de', 'it', 'pt'],
            },
            config: {
              type: 'object',
              properties: {
                telegramBotToken: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<{ message: string }>> => {
      const { id } = request.params
      const updates = request.body

      settingsService.updateNotificationChannel(id, updates)

      fastify.log.info({ id, updates }, 'Notification channel updated')

      return {
        success: true,
        data: {
          message: 'Channel updated successfully',
        },
      }
    }
  )

  /**
   * DELETE /api/config/notification-channels/:id
   * Removes a notification channel.
   */
  fastify.delete<{ Params: { id: string } }>(
    '/api/config/notification-channels/:id',
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

      settingsService.removeNotificationChannel(id)

      fastify.log.info({ id }, 'Notification channel removed')

      return {
        success: true,
        data: {
          message: 'Channel removed successfully',
        },
      }
    }
  )

  /**
   * POST /api/config/notification-channels/:id/toggle
   * Enables or disables a notification channel.
   */
  fastify.post<{ Params: { id: string }; Body: ToggleNotificationChannelBody }>(
    '/api/config/notification-channels/:id/toggle',
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
          required: ['enabled'],
          properties: {
            enabled: { type: 'boolean' },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<{ message: string; enabled: boolean }>> => {
      const { id } = request.params
      const { enabled } = request.body

      settingsService.toggleNotificationChannel(id, enabled)

      fastify.log.info({ id, enabled }, `Notification channel ${enabled ? 'enabled' : 'disabled'}`)

      return {
        success: true,
        data: {
          message: `Channel ${enabled ? 'enabled' : 'disabled'} successfully`,
          enabled,
        },
      }
    }
  )

  /**
   * POST /api/config/notification-channels/:id/test
   * Sends a test notification to a specific channel.
   */
  fastify.post<{ Params: { id: string } }>(
    '/api/config/notification-channels/:id/test',
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
    async (request): Promise<ApiResponse<{ success: boolean; error?: string }>> => {
      const { id } = request.params

      const result = await notificationService.sendTestNotification(id)

      fastify.log.info({ id, result }, 'Test notification sent')

      return {
        success: true,
        data: result,
      }
    }
  )

  /**
   * POST /api/config/notification-channels/test-config
   * Tests a channel configuration before saving it.
   */
  fastify.post<{ Body: TestChannelConfigBody }>(
    '/api/config/notification-channels/test-config',
    {
      schema: {
        body: {
          type: 'object',
          required: ['channelType', 'target', 'language'],
          properties: {
            channelType: {
              type: 'string',
              enum: ['whatsapp', 'discord', 'telegram'],
            },
            target: {
              type: 'string',
              minLength: 1,
            },
            language: {
              type: 'string',
              enum: ['fr', 'en', 'es', 'de', 'it', 'pt'],
            },
            config: {
              type: 'object',
              properties: {
                telegramBotToken: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<{ success: boolean; error?: string }>> => {
      const { channelType, target, language, config: channelConfig } = request.body

      // Create a temporary channel object for testing
      const tempChannel: NotificationChannel = {
        id: 'temp-test',
        channelType,
        target,
        displayName: 'Test',
        language,
        config: channelConfig,
        enabled: true,
        createdAt: new Date().toISOString(),
      }

      const sender = getSender(channelType)

      if (!sender.isAvailable(tempChannel)) {
        return {
          success: true,
          data: {
            success: false,
            error: `${channelType} sender is not available`,
          },
        }
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
        language,
        channelType
      )

      const result = await sender.send(tempChannel, testMessage.text)

      fastify.log.info({ channelType, target, result }, 'Test channel config')

      return {
        success: true,
        data: result,
      }
    }
  )
}
