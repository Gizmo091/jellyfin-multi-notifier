import { FastifyInstance } from 'fastify'
import { redirectService } from '../services/redirect/index.js'
import { config } from '../config.js'
import type { ApiResponse } from '../types/index.js'

interface RedirectParams {
  id: string
}

/**
 * Generate HTML page that tries to open Jellyfin app first, then falls back to web.
 * Detects platform and uses appropriate URL scheme:
 * - iOS: org.jellyfin.expo://items/{id}
 * - Android: jellyfin://details?id={id}
 */
function generateSmartRedirectHtml(itemId: string, webUrl: string, title: string): string {
  // Platform-specific deep link URLs
  const iosAppUrl = `org.jellyfin.expo://items/${itemId}`
  const androidAppUrl = `jellyfin://details?id=${itemId}`

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
      var iosAppUrl = ${JSON.stringify(iosAppUrl)};
      var androidAppUrl = ${JSON.stringify(androidAppUrl)};
      var webUrl = ${JSON.stringify(webUrl)};
      var timeout;

      // Detect platform
      var userAgent = navigator.userAgent || navigator.vendor || window.opera;
      var isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
      var isAndroid = /android/i.test(userAgent);

      // Choose appropriate app URL
      var appUrl = isIOS ? iosAppUrl : (isAndroid ? androidAppUrl : null);

      if (appUrl) {
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
      } else {
        // Desktop or unknown platform: go directly to web
        window.location.href = webUrl;
      }
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
   * Redirects to Jellyfin content.
   * If JELLYFIN_DEEP_LINK_ENABLED=true: tries app first, falls back to web.
   * Otherwise: direct redirect to web interface.
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

      // If deep link is disabled, redirect directly to web
      if (!config.jellyfinDeepLinkEnabled) {
        fastify.log.info({ redirectId: id, itemId: entry.jellyfinId, targetUrl: webUrl }, 'Redirecting to Jellyfin web')
        return reply.redirect(webUrl)
      }

      // Deep link enabled: serve smart redirect page
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
