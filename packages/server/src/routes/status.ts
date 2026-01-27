import { FastifyInstance } from 'fastify'
import { statusService } from '../services/status/index.js'
import { whatsappClient } from '../services/whatsapp/index.js'
import { queueService } from '../services/queue/index.js'
import { aggregationService } from '../services/aggregation/index.js'
import type { ApiResponse } from '../types/index.js'

interface ServiceStatus {
  uptime: {
    seconds: number
    formatted: string
  }
  startTime: string
  whatsapp: {
    connected: boolean
    phoneNumber?: string
  }
  queue: {
    pending: number
    failed: number
    total: number
  }
  aggregation: {
    moviesCount: number
    seriesCount: number
  }
  lastNotification: {
    timestamp: string
    type: 'movies' | 'series'
    count: number
    success: boolean
  } | null
  recentNotifications: Array<{
    timestamp: string
    type: 'movies' | 'series'
    count: number
    success: boolean
  }>
}

/**
 * Status routes for service health and monitoring.
 */
export async function statusRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/status
   * Returns the complete service status.
   */
  fastify.get('/api/status', async (): Promise<ApiResponse<ServiceStatus>> => {
    const status = statusService.getStatus()
    const waStatus = whatsappClient.getStatus()
    const queueCounts = queueService.getStatusCounts()
    const aggStatus = aggregationService.getStatus()

    return {
      success: true,
      data: {
        uptime: status.uptime,
        startTime: status.startTime,
        whatsapp: {
          connected: waStatus.connected,
          phoneNumber: waStatus.phoneNumber,
        },
        queue: {
          pending: queueCounts.pending,
          failed: queueCounts.failed,
          total: queueCounts.pending + queueCounts.sent + queueCounts.failed,
        },
        aggregation: {
          moviesCount: aggStatus.movies.count,
          seriesCount: aggStatus.series.count,
        },
        lastNotification: status.lastNotification
          ? {
              timestamp: status.lastNotification.timestamp.toISOString(),
              type: status.lastNotification.type,
              count: status.lastNotification.count,
              success: status.lastNotification.success,
            }
          : null,
        recentNotifications: status.recentNotifications.map((n) => ({
          timestamp: n.timestamp.toISOString(),
          type: n.type,
          count: n.count,
          success: n.success,
        })),
      },
    }
  })
}
