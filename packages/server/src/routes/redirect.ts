import { FastifyInstance } from 'fastify'
import { redirectService } from '../services/redirect/index.js'
import type { ApiResponse } from '../types/index.js'

interface RedirectParams {
  id: string
}

/**
 * Redirect routes for Jellyfin content links.
 */
export async function redirectRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /r/:id
   * Redirects to Jellyfin content.
   */
  fastify.get<{ Params: RedirectParams }>(
    '/r/:id',
    async (request, reply) => {
      const { id } = request.params

      const url = redirectService.getJellyfinUrl(id)

      if (!url) {
        fastify.log.warn({ redirectId: id }, 'Redirect not found')
        return reply.code(404).send({
          success: false,
          error: 'Redirect not found or expired. The link may have been removed.',
        } satisfies ApiResponse<never>)
      }

      fastify.log.info({ redirectId: id, targetUrl: url }, 'Redirecting to Jellyfin')
      return reply.redirect(url)
    }
  )

  /**
   * GET /api/redirects
   * Returns all stored redirects (for admin/debugging).
   */
  fastify.get('/api/redirects', async (): Promise<ApiResponse<{ count: number; entries: unknown[] }>> => {
    const entries = redirectService.getAllEntries()
    return {
      success: true,
      data: {
        count: entries.length,
        entries: entries.map((e) => ({
          shortId: e.shortId,
          title: e.title,
          createdAt: e.createdAt,
          url: `/r/${e.shortId}`,
        })),
      },
    }
  })
}
