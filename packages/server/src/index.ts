import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import { config } from './config.js'
import { webhookRoutes } from './routes/webhook.js'
import { whatsappRoutes } from './routes/whatsapp.js'
import { aggregationRoutes } from './routes/aggregation.js'
import { redirectRoutes } from './routes/redirect.js'
import { queueRoutes } from './routes/queue.js'
import { alertRoutes } from './routes/alert.js'
import { configRoutes } from './routes/config.js'
import { statusRoutes } from './routes/status.js'
import { authRoutes, authHook } from './routes/auth.js'
import { notificationService } from './services/notification/index.js'
import { retryService } from './services/retry/index.js'
import { alertService } from './services/alert/index.js'

const fastify = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
  },
})

// Register plugins
await fastify.register(cors, {
  origin: true,
  credentials: true,
})

await fastify.register(cookie, {
  secret: config.adminPassword, // Use admin password as cookie secret
})

// Register auth routes (before auth hook)
await fastify.register(authRoutes)

// Add auth hook for protected routes
authHook(fastify)

// Health check endpoint
fastify.get('/health', async () => {
  return { success: true, data: { status: 'ok' } }
})

// Root endpoint
fastify.get('/', async () => {
  return {
    success: true,
    data: {
      name: 'Jellyfin WhatsApp Notifier',
      version: '1.0.0',
      status: 'running',
    },
  }
})

// Register webhook routes
await fastify.register(webhookRoutes)

// Register WhatsApp routes
await fastify.register(whatsappRoutes)

// Register aggregation routes
await fastify.register(aggregationRoutes)

// Register redirect routes
await fastify.register(redirectRoutes)

// Register queue routes
await fastify.register(queueRoutes)

// Register alert routes
await fastify.register(alertRoutes)

// Register config routes
await fastify.register(configRoutes)

// Register status routes
await fastify.register(statusRoutes)

// Initialize notification service (wires aggregation events to WhatsApp)
notificationService.initialize()

// Initialize retry service (handles queue processing and automatic retries)
retryService.initialize()

// Initialize alert service (sends notifications on WhatsApp disconnect)
alertService.initialize()

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' })
    fastify.log.info(`Server listening on port ${config.port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
