import { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import type { ApiResponse } from '../types/index.js'

// Simple in-memory session store (for single instance)
const sessions = new Map<string, { createdAt: Date }>()
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Generate a random session token.
 */
function generateSessionToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Clean up expired sessions.
 */
function cleanupSessions(): void {
  const now = new Date()
  for (const [token, session] of sessions) {
    if (now.getTime() - session.createdAt.getTime() > SESSION_DURATION_MS) {
      sessions.delete(token)
    }
  }
}

/**
 * Validate a session token.
 */
export function isValidSession(token: string | undefined): boolean {
  if (!token) return false
  const session = sessions.get(token)
  if (!session) return false

  const now = new Date()
  if (now.getTime() - session.createdAt.getTime() > SESSION_DURATION_MS) {
    sessions.delete(token)
    return false
  }

  return true
}

/**
 * Auth routes for admin authentication.
 */
export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Cleanup sessions every hour
  setInterval(cleanupSessions, 60 * 60 * 1000)

  /**
   * POST /api/auth/login
   * Authenticates admin with password.
   */
  fastify.post<{ Body: { password: string } }>(
    '/api/auth/login',
    async (request, reply) => {
      const { password } = request.body || {}

      if (!password) {
        return reply.code(400).send({
          success: false,
          error: 'Password required',
        } satisfies ApiResponse<never>)
      }

      if (password !== config.adminPassword) {
        fastify.log.warn('Failed login attempt')
        return reply.code(401).send({
          success: false,
          error: 'Invalid password',
        } satisfies ApiResponse<never>)
      }

      // Create session
      const token = generateSessionToken()
      sessions.set(token, { createdAt: new Date() })

      // Set HTTP-only cookie
      reply.setCookie('session', token, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: SESSION_DURATION_MS / 1000,
      })

      fastify.log.info('Admin logged in')

      return {
        success: true,
        data: { message: 'Logged in' },
      } satisfies ApiResponse<{ message: string }>
    }
  )

  /**
   * POST /api/auth/logout
   * Logs out the current session.
   */
  fastify.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies.session
    if (token) {
      sessions.delete(token)
    }

    reply.clearCookie('session', { path: '/' })

    return {
      success: true,
      data: { message: 'Logged out' },
    } satisfies ApiResponse<{ message: string }>
  })

  /**
   * GET /api/auth/check
   * Checks if current session is valid.
   */
  fastify.get('/api/auth/check', async (request) => {
    const token = request.cookies.session
    const valid = isValidSession(token)

    return {
      success: true,
      data: { authenticated: valid },
    } satisfies ApiResponse<{ authenticated: boolean }>
  })
}

/**
 * Auth middleware hook for protected routes.
 */
export function authHook(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', async (request, reply) => {
    // Skip auth for public routes
    const publicPaths = [
      '/health',
      '/',
      '/api/auth/login',
      '/api/auth/check',
      '/webhook/jellyfin',
      '/r/', // Redirect routes are public
    ]

    const isPublic = publicPaths.some((path) =>
      request.url.startsWith(path) || request.url === path
    )

    if (isPublic) {
      return
    }

    // Check session
    const token = request.cookies.session
    if (!isValidSession(token)) {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
      })
    }
  })
}
