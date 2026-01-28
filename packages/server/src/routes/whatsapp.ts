import { FastifyInstance } from 'fastify'
import { whatsappClient, WhatsAppGroup } from '../services/whatsapp/index.js'
import { settingsService } from '../services/settings/index.js'
import type { ApiResponse, WhatsAppStatus } from '../types/index.js'

interface WhatsAppGroupsResponse {
  communities: Array<{
    id: string
    name: string
    image?: string
    groups: WhatsAppGroup[]
  }>
  standaloneGroups: WhatsAppGroup[]
}

interface ConnectRequestBody {
  phoneNumber: string
}

interface ConnectResponseData {
  pairingCode: string | null
  message: string
}

interface SendMessageRequestBody {
  groupId?: string
  message: string
}

interface SendMessageResponseData {
  sent: boolean
  groupId: string
}

interface SendImageRequestBody {
  groupId?: string
  imageUrl: string
  caption?: string
  fallbackToText?: boolean
}

interface SendImageResponseData {
  sent: boolean
  groupId: string
  fallback?: boolean
}

/**
 * WhatsApp API routes for connection management.
 */
export async function whatsappRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/whatsapp/status
   * Returns the current WhatsApp connection status.
   */
  fastify.get('/api/whatsapp/status', async (): Promise<ApiResponse<WhatsAppStatus>> => {
    const status = whatsappClient.getStatus()
    return {
      success: true,
      data: status,
    }
  })

  /**
   * POST /api/whatsapp/connect
   * Initiates a WhatsApp connection with pairing code.
   * Requires phone number in international format without + (e.g., "33612345678")
   */
  fastify.post<{ Body: ConnectRequestBody }>(
    '/api/whatsapp/connect',
    {
      schema: {
        body: {
          type: 'object',
          required: ['phoneNumber'],
          properties: {
            phoneNumber: {
              type: 'string',
              pattern: '^[0-9]{10,15}$',
              description: 'Phone number in international format without + (e.g., 33612345678)',
            },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<ConnectResponseData>> => {
      const { phoneNumber } = request.body

      // Validate phone number format
      if (!phoneNumber || !/^[0-9]{10,15}$/.test(phoneNumber)) {
        return {
          success: false,
          error: 'Invalid phone number format. Use international format without + (e.g., 33612345678)',
        }
      }

      // Check if already connected
      if (whatsappClient.isConnected()) {
        return {
          success: true,
          data: {
            pairingCode: null,
            message: 'WhatsApp is already connected',
          },
        }
      }

      try {
        fastify.log.info({ phoneNumber: phoneNumber.slice(0, 4) + '****' }, 'Requesting WhatsApp pairing code')

        const pairingCode = await whatsappClient.connect(phoneNumber)

        return {
          success: true,
          data: {
            pairingCode,
            message: pairingCode
              ? 'Enter this code in WhatsApp > Linked Devices > Link a Device'
              : 'Connection in progress, check logs for pairing code',
          },
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Connection failed'
        fastify.log.error({ error: errorMessage }, 'WhatsApp connection failed')

        return {
          success: false,
          error: errorMessage,
        }
      }
    }
  )

  /**
   * POST /api/whatsapp/connect-qr
   * Initiates a WhatsApp connection with QR code.
   * The QR code will be available in the status endpoint.
   */
  fastify.post('/api/whatsapp/connect-qr', async (): Promise<ApiResponse<{ message: string; qrCode?: string }>> => {
    // Check if already connected
    if (whatsappClient.isConnected()) {
      return {
        success: true,
        data: {
          message: 'WhatsApp is already connected',
        },
      }
    }

    try {
      fastify.log.info('Initiating WhatsApp QR code connection')

      // Start connection without phone number (QR mode)
      await whatsappClient.connect()

      // Get the current status which may include the QR code
      const status = whatsappClient.getStatus()

      return {
        success: true,
        data: {
          message: 'QR code connection initiated. Check status for QR code.',
          qrCode: status.qrCode,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed'
      fastify.log.error({ error: errorMessage }, 'WhatsApp QR connection failed')

      return {
        success: false,
        error: errorMessage,
      }
    }
  })

  /**
   * POST /api/whatsapp/disconnect
   * Disconnects from WhatsApp gracefully.
   */
  fastify.post('/api/whatsapp/disconnect', async (): Promise<ApiResponse<{ message: string }>> => {
    try {
      await whatsappClient.disconnect()
      return {
        success: true,
        data: {
          message: 'WhatsApp disconnected',
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Disconnect failed'
      return {
        success: false,
        error: errorMessage,
      }
    }
  })

  /**
   * POST /api/whatsapp/reconnect
   * Attempts to reconnect using existing session.
   */
  fastify.post('/api/whatsapp/reconnect', async (): Promise<ApiResponse<{ message: string }>> => {
    try {
      await whatsappClient.connect()
      return {
        success: true,
        data: {
          message: 'Reconnection initiated, check status for result',
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Reconnect failed'
      return {
        success: false,
        error: errorMessage,
      }
    }
  })

  /**
   * GET /api/whatsapp/groups
   * Returns all WhatsApp groups organized by community hierarchy.
   */
  fastify.get('/api/whatsapp/groups', async (): Promise<ApiResponse<WhatsAppGroupsResponse>> => {
    if (!whatsappClient.isConnected()) {
      return {
        success: false,
        error: 'WhatsApp is not connected',
      }
    }

    try {
      const allGroups = await whatsappClient.getGroups()

      // Separate communities and groups
      const communities = allGroups.filter((g) => g.isCommunity)
      const nonCommunityGroups = allGroups.filter((g) => !g.isCommunity)

      // Build community hierarchy
      const communityMap = new Map<
        string,
        { id: string; name: string; image?: string; groups: WhatsAppGroup[] }
      >()

      for (const community of communities) {
        communityMap.set(community.id, {
          id: community.id,
          name: community.name,
          image: community.image,
          groups: [],
        })
      }

      // Assign groups to their parent communities
      const standaloneGroups: WhatsAppGroup[] = []
      for (const group of nonCommunityGroups) {
        if (group.linkedParent && communityMap.has(group.linkedParent)) {
          communityMap.get(group.linkedParent)!.groups.push(group)
        } else {
          standaloneGroups.push(group)
        }
      }

      return {
        success: true,
        data: {
          communities: Array.from(communityMap.values()),
          standaloneGroups,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch groups'
      return {
        success: false,
        error: errorMessage,
      }
    }
  })

  /**
   * POST /api/whatsapp/send
   * Sends a text message to a WhatsApp group.
   * Uses configured group ID if not specified in request.
   */
  fastify.post<{ Body: SendMessageRequestBody }>(
    '/api/whatsapp/send',
    {
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            groupId: {
              type: 'string',
              description: 'WhatsApp group ID (optional, uses configured default)',
            },
            message: {
              type: 'string',
              minLength: 1,
              maxLength: 4096,
              description: 'Message text to send',
            },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<SendMessageResponseData>> => {
      const { groupId, message } = request.body

      // Validate message
      if (!message || message.trim().length === 0) {
        return {
          success: false,
          error: 'Message is required and cannot be empty',
        }
      }

      // Determine target group
      const targetGroup = groupId || settingsService.getWhatsAppGroupId()

      if (!targetGroup) {
        return {
          success: false,
          error: 'No group ID provided and no group configured in settings',
        }
      }

      // Check connection status
      if (!whatsappClient.isConnected()) {
        fastify.log.warn('Attempted to send message while WhatsApp disconnected')
        return {
          success: false,
          error: 'WhatsApp is not connected. Please connect first.',
        }
      }

      // Send the message
      const sent = await whatsappClient.sendTextMessage(targetGroup, message)

      if (sent) {
        fastify.log.info({ groupId: targetGroup, messageLength: message.length }, 'Message sent successfully')
        return {
          success: true,
          data: {
            sent: true,
            groupId: targetGroup,
          },
        }
      } else {
        fastify.log.error({ groupId: targetGroup }, 'Failed to send message')
        return {
          success: false,
          error: 'Failed to send message. Check logs for details.',
        }
      }
    }
  )

  /**
   * POST /api/whatsapp/send-image
   * Sends an image with optional caption to a WhatsApp group.
   * Falls back to text message if image fetch fails (configurable).
   */
  fastify.post<{ Body: SendImageRequestBody }>(
    '/api/whatsapp/send-image',
    {
      schema: {
        body: {
          type: 'object',
          required: ['imageUrl'],
          properties: {
            groupId: {
              type: 'string',
            },
            imageUrl: {
              type: 'string',
              format: 'uri',
            },
            caption: {
              type: 'string',
              maxLength: 4096,
            },
            fallbackToText: {
              type: 'boolean',
              default: true,
            },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<SendImageResponseData>> => {
      const { groupId, imageUrl, caption, fallbackToText = true } = request.body

      // Validate image URL
      if (!imageUrl || imageUrl.trim().length === 0) {
        return {
          success: false,
          error: 'Image URL is required',
        }
      }

      // Determine target group
      const targetGroup = groupId || settingsService.getWhatsAppGroupId()

      if (!targetGroup) {
        return {
          success: false,
          error: 'No group ID provided and no group configured in settings',
        }
      }

      // Check connection status
      if (!whatsappClient.isConnected()) {
        fastify.log.warn('Attempted to send image while WhatsApp disconnected')
        return {
          success: false,
          error: 'WhatsApp is not connected. Please connect first.',
        }
      }

      // Send the image
      const sent = await whatsappClient.sendImageMessage(targetGroup, imageUrl, caption, fallbackToText)

      if (sent) {
        fastify.log.info({ groupId: targetGroup, imageUrl: imageUrl.substring(0, 50) }, 'Image sent successfully')
        return {
          success: true,
          data: {
            sent: true,
            groupId: targetGroup,
          },
        }
      } else {
        fastify.log.error({ groupId: targetGroup }, 'Failed to send image')
        return {
          success: false,
          error: 'Failed to send image. Check logs for details.',
        }
      }
    }
  )
}
