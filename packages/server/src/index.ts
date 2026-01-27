import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import { webhookRoutes } from './routes/webhook.js'
import { whatsappRoutes } from './routes/whatsapp.js'

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
