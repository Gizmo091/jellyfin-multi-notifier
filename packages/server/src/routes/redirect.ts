import { FastifyInstance } from 'fastify'
import { redirectService } from '../services/redirect/index.js'
import type { ApiResponse } from '../types/index.js'

interface RedirectParams {
  id: string
}

/**
 * Generate HTML page that tries to open Jellyfin app first, then falls back to web.
 */
function generateSmartRedirectHtml(itemId: string, webUrl: string, title: string): string {
  const appUrl = `jellyfin://details?id=${itemId}`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Opening ${title}...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
      color: #00a4dc;
    }
    p {
      color: #ccc;
      margin-bottom: 1.5rem;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #333;
      border-top-color: #00a4dc;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1.5rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .fallback-link {
      color: #00a4dc;
      text-decoration: none;
      padding: 0.75rem 1.5rem;
      border: 1px solid #00a4dc;
      border-radius: 4px;
      display: inline-block;
      transition: background 0.2s;
    }
    .fallback-link:hover {
      background: #00a4dc;
      color: #fff;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>Opening in Jellyfin...</h1>
    <p>If the app doesn't open, <a href="${webUrl}" class="fallback-link">open in browser</a></p>
  </div>
  <script>
    (function() {
      var appUrl = ${JSON.stringify(appUrl)};
      var webUrl = ${JSON.stringify(webUrl)};
      var timeout;

      // Try to open the app
      window.location.href = appUrl;

      // If still here after 2.5 seconds, redirect to web
      timeout = setTimeout(function() {
        window.location.href = webUrl;
      }, 2500);

      // If page becomes hidden (app opened), clear the timeout
      document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
          clearTimeout(timeout);
        }
      });
    })();
  </script>
</body>
</html>`
}

/**
 * Redirect routes for Jellyfin content links.
 */
export async function redirectRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /r/:id
   * Smart redirect: tries Jellyfin app first, falls back to web.
   */
  fastify.get<{ Params: RedirectParams }>(
    '/r/:id',
    async (request, reply) => {
      const { id } = request.params

      const entry = redirectService.getEntry(id)

      if (!entry) {
        fastify.log.warn({ redirectId: id }, 'Redirect not found')
        return reply.code(404).send({
          success: false,
          error: 'Redirect not found or expired. The link may have been removed.',
        } satisfies ApiResponse<never>)
      }

      const webUrl = redirectService.getJellyfinUrl(id)!
      const html = generateSmartRedirectHtml(entry.jellyfinId, webUrl, entry.title)

      fastify.log.info({ redirectId: id, itemId: entry.jellyfinId }, 'Serving smart redirect page')
      return reply.type('text/html').send(html)
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
