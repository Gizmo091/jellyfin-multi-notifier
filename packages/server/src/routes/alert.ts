import { FastifyInstance } from 'fastify'
import { alertService } from '../services/alert/index.js'
import type { ApiResponse } from '../types/index.js'

interface AlertChannels {
  email: boolean
  telegram: boolean
  discord: boolean
}

interface AlertResult {
  channel: string
  success: boolean
  error?: string
}

/**
 * Alert routes for testing and status.
 */
export async function alertRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/alerts/status
   * Returns which alert channels are configured.
   */
  fastify.get('/api/alerts/status', async (): Promise<ApiResponse<AlertChannels>> => {
    const channels = alertService.getConfiguredChannels()

    return {
      success: true,
      data: channels,
    }
  })

  /**
   * POST /api/alerts/test
   * Sends a test alert to all configured channels.
   */
  fastify.post('/api/alerts/test', async (): Promise<ApiResponse<{ results: AlertResult[] }>> => {
    const results = await alertService.testAlerts()

    return {
      success: true,
      data: { results },
    }
  })
}
