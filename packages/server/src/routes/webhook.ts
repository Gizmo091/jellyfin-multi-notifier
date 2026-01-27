import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { timingSafeEqual } from 'crypto'
import { config } from '../config.js'
import { extractMediaEvent } from '../services/media-extractor.js'
import { mediaStore } from '../services/media-store.js'
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
      fastify.log.info({
        msg: 'Webhook received from Jellyfin',
        notificationType: payload?.NotificationType,
      })

      // Extract media event from payload
      const event = extractMediaEvent(payload)

      if (event) {
        // Store the event for later aggregation (Epic 3)
        mediaStore.addEvent(event)

        fastify.log.info({
          msg: 'Media event extracted and stored',
          eventId: event.id,
          type: event.type,
          title: event.title,
          eventType: event.eventType,
          coverUrl: event.coverUrl,
          storeCount: mediaStore.getEventCount(),
        })
      } else {
        fastify.log.debug({
          msg: 'Webhook not processed (unsupported type or missing data)',
          notificationType: payload?.NotificationType,
        })
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
