import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { timingSafeEqual } from 'crypto'
import { config } from '../config.js'
import type { ApiResponse } from '../types/index.js'

// Webhook response types
interface WebhookReceivedData {
  received: true
  timestamp: string
}

// Jellyfin webhook payload (basic structure, will be extended in Story 1.3)
export interface JellyfinWebhookPayload {
  NotificationType?: string
  [key: string]: unknown
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
        description: 'Receive webhook events from Jellyfin',
        tags: ['webhook'],
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
      // Log the webhook receipt (payload processing will be in Story 1.3)
      fastify.log.info({
        msg: 'Webhook received from Jellyfin',
        notificationType: request.body?.NotificationType,
      })

      return {
        success: true,
        data: {
          received: true,
          timestamp: new Date().toISOString(),
        },
      }
    }
  )
}
