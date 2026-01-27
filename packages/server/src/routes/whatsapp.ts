import { FastifyInstance } from 'fastify'
import { whatsappClient } from '../services/whatsapp/index.js'
import type { ApiResponse, WhatsAppStatus } from '../types/index.js'

interface ConnectRequestBody {
  phoneNumber: string
}

interface ConnectResponseData {
  pairingCode: string | null
  message: string
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
}
