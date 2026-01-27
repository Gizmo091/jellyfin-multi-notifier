import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import path from 'path'
import fs from 'fs'
import { EventEmitter } from 'events'

const SESSION_PATH = path.join(process.cwd(), 'data', 'whatsapp-session')

export interface WhatsAppStatus {
  connected: boolean
  phoneNumber?: string
  lastConnected?: Date
  pairingCode?: string
  error?: string
}

/**
 * WhatsApp client service using Baileys library.
 * Implements pairing code authentication (no QR scan needed).
 * Session is persisted in data/whatsapp-session/ for reconnection.
 */
class WhatsAppClient extends EventEmitter {
  private socket: WASocket | null = null
  private status: WhatsAppStatus = { connected: false }
  private logger = pino({ level: 'silent' }) // Suppress Baileys verbose logs
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private isConnecting = false

  constructor() {
    super()
    this.ensureSessionDirectory()
  }

  /**
   * Ensures the session directory exists.
   */
  private ensureSessionDirectory(): void {
    if (!fs.existsSync(SESSION_PATH)) {
      fs.mkdirSync(SESSION_PATH, { recursive: true })
      console.log(`Created WhatsApp session directory: ${SESSION_PATH}`)
    }
  }

  /**
   * Connects to WhatsApp. If phoneNumber is provided and not yet registered,
   * generates a pairing code for the admin to enter on their phone.
   *
   * @param phoneNumber - Phone number in international format without + (e.g., "33612345678")
   * @returns The pairing code if generated, null if already connected/reconnecting
   */
  async connect(phoneNumber?: string): Promise<string | null> {
    if (this.isConnecting) {
      console.log('WhatsApp connection already in progress')
      return null
    }

    this.isConnecting = true
    this.status.error = undefined

    try {
      const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH)
      const { version } = await fetchLatestBaileysVersion()

      this.socket = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // We use pairing code, not QR
        logger: this.logger,
        browser: ['Jellyfin Notifier', 'Chrome', '120.0.0'],
        generateHighQualityLinkPreview: false,
      })

      // Handle connection updates
      this.socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update

        if (connection === 'close') {
          this.status.connected = false
          this.isConnecting = false
          const error = lastDisconnect?.error as Boom
          const statusCode = error?.output?.statusCode
          const reason = DisconnectReason[statusCode] || `Unknown (${statusCode})`

          console.log(`WhatsApp disconnected: ${reason}`)

          if (statusCode === DisconnectReason.loggedOut) {
            // Session invalidated, need new pairing
            console.log('WhatsApp logged out - session invalidated. Need to re-pair.')
            this.status.error = 'Logged out from WhatsApp. Please reconnect with a new pairing code.'
            this.emit('logged-out')
            // Clear session files
            await this.clearSession()
          } else if (statusCode !== DisconnectReason.connectionClosed) {
            // Try to reconnect for other errors
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
              this.reconnectAttempts++
              const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000)
              console.log(`Attempting reconnect in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
              setTimeout(() => this.connect(phoneNumber), delay)
            } else {
              console.log('Max reconnect attempts reached')
              this.status.error = 'Connection lost. Max reconnect attempts reached.'
              this.emit('disconnected', { reason, permanent: true })
            }
          }

          this.emit('disconnected', { reason, permanent: statusCode === DisconnectReason.loggedOut })
        }

        if (connection === 'open') {
          this.status.connected = true
          this.status.lastConnected = new Date()
          this.status.phoneNumber = this.socket?.user?.id?.split(':')[0]
          this.status.pairingCode = undefined
          this.status.error = undefined
          this.reconnectAttempts = 0
          this.isConnecting = false
          console.log(`WhatsApp connected successfully as ${this.status.phoneNumber}`)
          this.emit('connected', { phoneNumber: this.status.phoneNumber })
        }
      })

      // Save credentials on update
      this.socket.ev.on('creds.update', saveCreds)

      // Request pairing code if not registered and phone number provided
      if (!state.creds.registered && phoneNumber) {
        // Wait a bit for socket to be ready
        await new Promise((resolve) => setTimeout(resolve, 2000))

        try {
          const code = await this.socket.requestPairingCode(phoneNumber)
          this.status.pairingCode = code
          this.isConnecting = false
          console.log('═'.repeat(50))
          console.log(`WhatsApp Pairing Code: ${code}`)
          console.log('Enter this code in WhatsApp > Linked Devices > Link a Device')
          console.log('═'.repeat(50))
          return code
        } catch (error) {
          this.isConnecting = false
          const errorMessage = error instanceof Error ? error.message : 'Failed to get pairing code'
          console.error('Failed to request pairing code:', errorMessage)
          this.status.error = errorMessage
          throw error
        }
      }

      return null
    } catch (error) {
      this.isConnecting = false
      const errorMessage = error instanceof Error ? error.message : 'Connection failed'
      this.status.error = errorMessage
      console.error('WhatsApp connection error:', errorMessage)
      throw error
    }
  }

  /**
   * Clears the session files for a fresh start.
   */
  async clearSession(): Promise<void> {
    try {
      if (fs.existsSync(SESSION_PATH)) {
        const files = fs.readdirSync(SESSION_PATH)
        for (const file of files) {
          fs.unlinkSync(path.join(SESSION_PATH, file))
        }
        console.log('WhatsApp session cleared')
      }
    } catch (error) {
      console.error('Failed to clear session:', error)
    }
  }

  /**
   * Disconnects from WhatsApp gracefully.
   */
  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.end(undefined)
      this.socket = null
      this.status.connected = false
      console.log('WhatsApp disconnected')
    }
  }

  /**
   * Returns the current connection status.
   */
  getStatus(): WhatsAppStatus {
    return { ...this.status }
  }

  /**
   * Returns the socket instance for sending messages.
   * Returns null if not connected.
   */
  getSocket(): WASocket | null {
    return this.socket
  }

  /**
   * Checks if WhatsApp is currently connected.
   */
  isConnected(): boolean {
    return this.status.connected
  }

  /**
   * Sends a text message to a WhatsApp group or individual chat.
   *
   * @param jid - The WhatsApp JID (group: xxx@g.us, individual: xxx@s.whatsapp.net)
   * @param text - The message text to send
   * @returns true if message was sent successfully, false otherwise
   */
  async sendTextMessage(jid: string, text: string): Promise<boolean> {
    if (!this.isConnected() || !this.socket) {
      console.error('Cannot send message: WhatsApp not connected')
      this.emit('message-failed', { jid, text, error: 'Not connected' })
      return false
    }

    // Normalize group ID format
    let targetJid = jid
    if (!jid.includes('@')) {
      // Assume it's a group ID without suffix
      targetJid = `${jid}@g.us`
    }

    try {
      const result = await this.socket.sendMessage(targetJid, { text })
      console.log(`Message sent to ${targetJid}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`)
      this.emit('message-sent', { jid: targetJid, text, messageId: result?.key?.id })
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`Failed to send message to ${targetJid}:`, errorMessage)
      this.emit('message-failed', { jid: targetJid, text, error: errorMessage })
      return false
    }
  }

  /**
   * Sends an image message with optional caption to a WhatsApp group or individual chat.
   *
   * @param jid - The WhatsApp JID (group: xxx@g.us, individual: xxx@s.whatsapp.net)
   * @param imageUrl - URL of the image to send
   * @param caption - Optional caption for the image
   * @param fallbackToText - If true, sends caption as text if image fetch fails (default: true)
   * @returns true if message was sent successfully, false otherwise
   */
  async sendImageMessage(
    jid: string,
    imageUrl: string,
    caption?: string,
    fallbackToText = true
  ): Promise<boolean> {
    if (!this.isConnected() || !this.socket) {
      console.error('Cannot send image: WhatsApp not connected')
      this.emit('message-failed', { jid, type: 'image', error: 'Not connected' })
      return false
    }

    // Normalize group ID format
    let targetJid = jid
    if (!jid.includes('@')) {
      targetJid = `${jid}@g.us`
    }

    try {
      // Fetch image from URL
      const response = await fetch(imageUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch image: HTTP ${response.status}`)
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.startsWith('image/')) {
        throw new Error(`Invalid content type: ${contentType}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Send image via WhatsApp
      const result = await this.socket.sendMessage(targetJid, {
        image: buffer,
        caption: caption || undefined,
      })

      console.log(`Image sent to ${targetJid}${caption ? ` with caption: "${caption.substring(0, 30)}${caption.length > 30 ? '...' : ''}"` : ''}`)
      this.emit('message-sent', { jid: targetJid, type: 'image', caption, messageId: result?.key?.id })
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`Failed to send image to ${targetJid}:`, errorMessage)

      // Fallback to text message if enabled and caption provided
      if (fallbackToText && caption) {
        console.log(`Falling back to text message for ${targetJid}`)
        const textSent = await this.sendTextMessage(targetJid, caption)
        if (textSent) {
          this.emit('message-fallback', { jid: targetJid, originalType: 'image', fallbackType: 'text' })
          return true
        }
      }

      this.emit('message-failed', { jid: targetJid, type: 'image', error: errorMessage })
      return false
    }
  }
}

// Singleton instance
export const whatsappClient = new WhatsAppClient()
