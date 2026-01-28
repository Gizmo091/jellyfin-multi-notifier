import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { config } from './config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
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
    decorateReply: false,
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

// Auto-connect WhatsApp if phone number is configured
if (config.whatsappPhoneNumber) {
  // Strip leading + if present (Baileys expects number without +)
  const phoneNumber = config.whatsappPhoneNumber.replace(/^\+/, '')
  console.log('Auto-connecting WhatsApp with configured phone number...')
  whatsappClient.connect(phoneNumber).catch((err) => {
    console.error('WhatsApp auto-connect failed:', err)
  })
}

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
