import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { timingSafeEqual } from 'crypto'
import { config } from '../config.js'
import { extractMediaEvent } from '../services/media-extractor.js'
import { mediaStore } from '../services/media-store.js'
import { aggregationService } from '../services/aggregation/index.js'
import { jellyfinService } from '../services/jellyfin/index.js'
import { notifiedMediaService } from '../services/notified-media/index.js'
import { logger } from '../services/logger/index.js'
import type { ApiResponse, JellyfinWebhookPayload, MediaEvent } from '../types/index.js'

// Webhook response types
interface WebhookReceivedData {
  received: true
  timestamp: string
  event?: MediaEvent | null
}

/**
 * Validates the X-Webhook-Secret header using timing-safe comparison
 * to prevent timing attacks.
 */
function validateWebhookSecret(headerValue: string | string[] | undefined): boolean {
  if (!headerValue || typeof headerValue !== 'string') {
    return false
  }

  // Empty secret in config means webhook validation is disabled (not recommended)
  if (!config.webhookSecret) {
    return false
  }

  const expected = Buffer.from(config.webhookSecret, 'utf8')
  const received = Buffer.from(headerValue, 'utf8')

  // timingSafeEqual requires buffers of the same length
  if (expected.length !== received.length) {
    return false
  }

  return timingSafeEqual(expected, received)
}

export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  // Jellyfin's webhook plugin may send with content-type text/plain or other non-JSON types.
  // Add parsers so Fastify can handle these as JSON.
  fastify.addContentTypeParser(
    ['text/plain', 'text/*', 'application/x-www-form-urlencoded'],
    { parseAs: 'string' },
    (_request, body, done) => {
      try {
        const json = JSON.parse(body as string)
        done(null, json)
      } catch (err) {
        done(err as Error, undefined)
      }
    }
  )

  // If the body arrives as a string (edge case), try to parse it as JSON before validation
  fastify.addHook('preValidation', async (request: FastifyRequest) => {
    if (typeof request.body === 'string') {
      try {
        request.body = JSON.parse(request.body)
        logger.debug('Webhook', 'Parsed string body as JSON')
      } catch {
        logger.warn('Webhook', 'Failed to parse string body as JSON', { body: (request.body as string).substring(0, 200) })
      }
    }
  })

  // Pre-handler hook for secret validation on all routes in this plugin
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const secret = request.headers['x-webhook-secret']

    if (!secret) {
      fastify.log.warn('Webhook request received without X-Webhook-Secret header')
      return reply.code(401).send({
        success: false,
        error: 'Missing webhook secret',
      } satisfies ApiResponse<never>)
    }

    if (!validateWebhookSecret(secret)) {
      fastify.log.warn('Webhook request received with invalid secret')
      return reply.code(401).send({
        success: false,
        error: 'Invalid webhook secret',
      } satisfies ApiResponse<never>)
    }
  })

  // POST /webhook/jellyfin - Receive Jellyfin webhook events
  fastify.post<{ Body: JellyfinWebhookPayload }>(
    '/webhook/jellyfin',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  received: { type: 'boolean' },
                  timestamp: { type: 'string' },
                  event: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      id: { type: 'string' },
                      type: { type: 'string' },
                      title: { type: 'string' },
                      year: { type: 'number', nullable: true },
                      coverUrl: { type: 'string', nullable: true },
                      jellyfinId: { type: 'string' },
                      eventType: { type: 'string' },
                      timestamp: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          401: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, _reply): Promise<ApiResponse<WebhookReceivedData>> => {
      const payload = request.body

      // Log the webhook receipt
      logger.info('Webhook', 'Webhook received from Jellyfin', { notificationType: payload?.NotificationType })

      // Extract media event from payload
      const event = extractMediaEvent(payload)

      if (event) {
        // Store the event for later reference
        mediaStore.addEvent(event)

        // Check if this media has already been notified
        const alreadyNotified = notifiedMediaService.isNotified(event.jellyfinId, event.eventType)
        if (alreadyNotified) {
          logger.info('Webhook', `Skipping already notified "${event.title}"`, {
            eventId: event.id,
            type: event.type,
            title: event.title,
            jellyfinId: event.jellyfinId,
            eventType: event.eventType,
          })
          return {
            success: true,
            data: {
              received: true,
              timestamp: new Date().toISOString(),
              event,
            },
          }
        }

        // For "added" events, check if this is an upgrade (re-import of existing media)
        // Only check if Jellyfin API is configured
        let isUpgrade = false
        if (event.eventType === 'added' && jellyfinService.isConfigured()) {
          const upgradeCheck = await jellyfinService.isUpgrade(event.jellyfinId)
          if (upgradeCheck === true) {
            isUpgrade = true
            // Mark as notified so we don't check again
            notifiedMediaService.markNotified(event.jellyfinId, event.eventType, event.title)
            logger.info('Webhook', `Skipping upgrade notification for "${event.title}"`, {
              eventId: event.id,
              type: event.type,
              title: event.title,
              jellyfinId: event.jellyfinId,
            })
          }
        }

        // Add to aggregation window (skip if upgrade)
        if (!isUpgrade) {
          aggregationService.addMedia(event)
          logger.info('Webhook', 'Media event extracted and stored', {
            eventId: event.id,
            type: event.type,
            title: event.title,
            eventType: event.eventType,
            coverUrl: event.coverUrl,
            storeCount: mediaStore.getEventCount(),
          })
        }
      } else {
        logger.debug('Webhook', 'Webhook not processed (unsupported type or missing data)', { notificationType: payload?.NotificationType })
      }

      return {
        success: true,
        data: {
          received: true,
          timestamp: new Date().toISOString(),
          event,
        },
      }
    }
  )
}
