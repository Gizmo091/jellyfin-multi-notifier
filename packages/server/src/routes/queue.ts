import { FastifyInstance } from 'fastify'
import { queueService, QueueMessage } from '../services/queue/index.js'
import type { ApiResponse } from '../types/index.js'

interface QueueStatus {
  pending: number
  sent: number
  failed: number
  total: number
}

interface QueueListResponse {
  status: QueueStatus
  messages: QueueMessage[]
}

/**
 * Queue routes for viewing and managing the message queue.
 */
export async function queueRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/queue
   * Returns the current queue status and messages.
   */
  fastify.get('/api/queue', async (): Promise<ApiResponse<QueueListResponse>> => {
    const counts = queueService.getStatusCounts()
    const messages = queueService.getAllMessages()

    return {
      success: true,
      data: {
        status: {
          ...counts,
          total: counts.pending + counts.sent + counts.failed,
        },
        messages,
      },
    }
  })

  /**
   * GET /api/queue/pending
   * Returns only pending messages.
   */
  fastify.get('/api/queue/pending', async (): Promise<ApiResponse<{ count: number; messages: QueueMessage[] }>> => {
    const messages = queueService.getPendingMessages()

    return {
      success: true,
      data: {
        count: messages.length,
        messages,
      },
    }
  })

  /**
   * DELETE /api/queue/sent
   * Clears all sent messages from the queue.
   */
  fastify.delete('/api/queue/sent', async (): Promise<ApiResponse<{ cleared: number }>> => {
    const cleared = queueService.clearSentMessages()

    return {
      success: true,
      data: { cleared },
    }
  })

  /**
   * DELETE /api/queue/:id
   * Removes a specific message from the queue.
   */
  fastify.delete<{ Params: { id: string } }>('/api/queue/:id', async (request, reply): Promise<ApiResponse<{ removed: boolean }>> => {
    const id = parseInt(request.params.id, 10)

    if (isNaN(id)) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid message ID',
      })
    }

    const message = queueService.getMessage(id)
    if (!message) {
      return reply.code(404).send({
        success: false,
        error: 'Message not found',
      })
    }

    queueService.removeMessage(id)

    return {
      success: true,
      data: { removed: true },
    }
  })
}
