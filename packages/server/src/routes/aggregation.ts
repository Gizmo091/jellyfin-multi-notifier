import { FastifyInstance } from 'fastify'
import { aggregationService, AggregationStatus } from '../services/aggregation/index.js'
import type { ApiResponse } from '../types/index.js'

type WindowType = 'movies' | 'series' | 'movies-removed' | 'series-removed'

/**
 * Aggregation API routes for monitoring aggregation windows.
 */
export async function aggregationRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/aggregation/status
   * Returns the current aggregation window status.
   */
  fastify.get('/api/aggregation/status', async (): Promise<ApiResponse<AggregationStatus>> => {
    const status = aggregationService.getStatus()
    return {
      success: true,
      data: status,
    }
  })

  /**
   * POST /api/aggregation/flush
   * Manually flushes all aggregation windows (for testing/admin).
   */
  fastify.post('/api/aggregation/flush', async (): Promise<ApiResponse<{ flushed: boolean }>> => {
    aggregationService.flushAll()
    return {
      success: true,
      data: {
        flushed: true,
      },
    }
  })

  /**
   * POST /api/aggregation/cancel/:type
   * Cancels a specific aggregation window without sending notifications.
   */
  fastify.post<{ Params: { type: WindowType } }>(
    '/api/aggregation/cancel/:type',
    {
      schema: {
        params: {
          type: 'object',
          required: ['type'],
          properties: {
            type: {
              type: 'string',
              enum: ['movies', 'series', 'movies-removed', 'series-removed'],
            },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<{ cancelled: boolean; itemsDiscarded: number }>> => {
      const { type } = request.params
      const itemsDiscarded = aggregationService.cancelWindow(type)
      return {
        success: true,
        data: {
          cancelled: true,
          itemsDiscarded,
        },
      }
    }
  )
}
