import { FastifyInstance } from 'fastify'
import { logger, type LogEntry, type LogLevel } from '../services/logger/index.js'
import type { ApiResponse } from '../types/index.js'

interface LogsQuerystring {
  level?: LogLevel
  category?: string
  limit?: string
}

/**
 * Logs routes for admin visibility.
 */
export async function logsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/logs
   * Returns recent logs with optional filtering.
   */
  fastify.get<{ Querystring: LogsQuerystring }>(
    '/api/logs',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            level: {
              type: 'string',
              enum: ['debug', 'info', 'warn', 'error'],
            },
            category: {
              type: 'string',
            },
            limit: {
              type: 'string',
            },
          },
        },
      },
    },
    async (request): Promise<ApiResponse<{ logs: LogEntry[]; total: number }>> => {
      const { level, category, limit } = request.query

      const logs = logger.getLogs({
        level,
        category,
        limit: limit ? parseInt(limit, 10) : 100,
      })

      return {
        success: true,
        data: {
          logs: logs.reverse(), // Most recent first
          total: logger.getCount(),
        },
      }
    }
  )

  /**
   * DELETE /api/logs
   * Clears all logs.
   */
  fastify.delete('/api/logs', async (): Promise<ApiResponse<{ message: string }>> => {
    logger.clear()
    return {
      success: true,
      data: {
        message: 'Logs cleared',
      },
    }
  })
}
