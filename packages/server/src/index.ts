import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { config } from './config.js'
import { logger } from './services/logger/index.js'
import { aggregationService } from './services/aggregation/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Validate critical configuration at startup
function validateConfig(): void {
  const errors: string[] = []

  // Validate JELLYFIN_URL
  if (config.jellyfinUrl) {
    try {
      new URL(config.jellyfinUrl)
    } catch {
      errors.push(`JELLYFIN_URL is not a valid URL: ${config.jellyfinUrl}`)
    }
  }

  // Validate PUBLIC_URL
  if (config.publicUrl) {
    try {
      new URL(config.publicUrl)
    } catch {
      errors.push(`PUBLIC_URL is not a valid URL: ${config.publicUrl}`)
    }
  }

  // Validate PORT
  if (config.port < 1 || config.port > 65535) {
    errors.push(`PORT must be between 1 and 65535, got: ${config.port}`)
  }

  // Warn about default admin password in production
  if (config.nodeEnv === 'production' && config.adminPassword === 'changeme') {
    console.warn('⚠️  WARNING: Using default admin password in production. Please set ADMIN_PASSWORD.')
  }

  // Warn about missing webhook secret
  if (!config.webhookSecret) {
    console.warn('⚠️  WARNING: WEBHOOK_SECRET is not set. Webhook endpoints will reject all requests.')
  } else if (config.webhookSecret.length < 16) {
    console.warn('⚠️  WARNING: WEBHOOK_SECRET is too short (< 16 characters). Consider using a longer secret.')
  }

  if (errors.length > 0) {
    console.error('❌ Configuration errors:')
    for (const error of errors) {
      console.error(`   - ${error}`)
    }
    process.exit(1)
  }
}

validateConfig()

import { webhookRoutes } from './routes/webhook.js'
import { whatsappRoutes } from './routes/whatsapp.js'
import { aggregationRoutes } from './routes/aggregation.js'
import { redirectRoutes } from './routes/redirect.js'
import { queueRoutes } from './routes/queue.js'
import { alertRoutes } from './routes/alert.js'
import { configRoutes } from './routes/config.js'
import { statusRoutes } from './routes/status.js'
import { logsRoutes } from './routes/logs.js'
import { authRoutes, authHook } from './routes/auth.js'
import { notificationService } from './services/notification/index.js'
import { retryService } from './services/retry/index.js'
import { alertService } from './services/alert/index.js'
import { whatsappClient } from './services/whatsapp/client.js'

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

// Register logs routes
await fastify.register(logsRoutes)

// Serve static files from admin build (production)
const adminDistPath = path.join(__dirname, '../../admin/dist')
if (fs.existsSync(adminDistPath)) {
  await fastify.register(fastifyStatic, {
    root: adminDistPath,
    prefix: '/',
  })

  // SPA fallback: serve index.html for all non-API routes
  fastify.setNotFoundHandler((request, reply) => {
    // Don't serve index.html for API routes
    if (request.url.startsWith('/api/') || request.url.startsWith('/webhook')) {
      return reply.status(404).send({ success: false, error: 'Not found' })
    }
    // Serve index.html for SPA routing
    return reply.sendFile('index.html')
  })

  fastify.log.info(`Serving admin UI from ${adminDistPath}`)
} else {
  fastify.log.warn(`Admin dist not found at ${adminDistPath}. Run 'npm run build' in packages/admin first.`)
}

// Initialize notification service (wires aggregation events to WhatsApp)
notificationService.initialize()

// Initialize retry service (handles queue processing and automatic retries)
retryService.initialize()

// Initialize alert service (sends notifications on WhatsApp disconnect)
alertService.initialize()

// Auto-connect WhatsApp on startup if enabled
if (config.whatsappLoginOnStartup) {
  // If phone number is configured, use pairing code. Otherwise, show QR code.
  const phoneNumber = config.whatsappPhoneNumber?.replace(/^\+/, '') || undefined
  if (phoneNumber) {
    console.log('Auto-connecting WhatsApp with pairing code...')
  } else {
    console.log('Auto-connecting WhatsApp with QR code...')
  }
  whatsappClient.connect(phoneNumber).catch((err) => {
    console.error('WhatsApp auto-connect failed:', err)
  })
} else {
  console.log('WhatsApp auto-connect disabled (WHATSAPP_LOGIN_ON_STARTUP=false)')
}

// Graceful shutdown handler
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info('Server', `Received ${signal}, starting graceful shutdown...`)

  // Flush all aggregation windows to prevent data loss
  logger.info('Server', 'Flushing aggregation windows...')
  aggregationService.flushAll()

  // Disconnect WhatsApp gracefully
  logger.info('Server', 'Disconnecting WhatsApp...')
  await whatsappClient.disconnect()

  // Close Fastify server
  logger.info('Server', 'Closing HTTP server...')
  await fastify.close()

  // Close logger database connection
  logger.info('Server', 'Shutdown complete')
  logger.close()

  process.exit(0)
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' })
    logger.info('Server', `Server listening on port ${config.port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
