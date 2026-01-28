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
import QRCode from 'qrcode'
import { logger } from '../logger/index.js'

const SESSION_PATH = path.join(process.cwd(), 'data', 'whatsapp-session')

export interface WhatsAppStatus {
  connected: boolean
  phoneNumber?: string
  lastConnected?: Date
  pairingCode?: string
  qrCode?: string
  error?: string
  disconnectReason?: string
  isReconnecting?: boolean
}

export interface WhatsAppGroup {
  id: string
  name: string
  image?: string
  isCommunity: boolean
  isCommunityAnnounce?: boolean
  linkedParent?: string
  participantCount: number
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
  private pendingPhoneNumber: string | null = null // Phone number waiting for pairing
  private pairingCodeRequested = false // Flag to prevent duplicate pairing code requests

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
        const { connection, lastDisconnect, qr } = update

        // Handle QR code for authentication
        if (qr) {
          // If phone number is provided, request pairing code instead of using QR
          // Don't emit QR when using pairing code - they can conflict
          if (this.pendingPhoneNumber && !this.pairingCodeRequested && this.socket) {
            this.pairingCodeRequested = true
            try {
              const code = await this.socket.requestPairingCode(this.pendingPhoneNumber)
              this.status.pairingCode = code
              this.status.qrCode = undefined // Clear QR since we're using pairing code
              console.log('═'.repeat(50))
              console.log(`WhatsApp Pairing Code: ${code}`)
              console.log('Enter this code in WhatsApp > Linked Devices > Link a Device')
              console.log('═'.repeat(50))
              this.emit('pairing-code', code)
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Failed to get pairing code'
              console.error('Failed to request pairing code:', errorMessage)
              this.status.error = errorMessage
              this.emit('pairing-error', errorMessage)
            }
          } else if (!this.pendingPhoneNumber) {
            // Only use QR code if no phone number configured
            this.status.qrCode = qr

            // Print QR code in terminal
            console.log('\n' + '═'.repeat(50))
            console.log('Scan this QR code with WhatsApp:')
            console.log('WhatsApp > Linked Devices > Link a Device')
            console.log('═'.repeat(50))
            try {
              const terminalQR = await QRCode.toString(qr, { type: 'terminal', small: true })
              console.log(terminalQR)
            } catch (err) {
              console.log('(QR code available in admin UI)')
            }
            console.log('═'.repeat(50) + '\n')

            // Generate PNG buffer for notifications
            try {
              const qrImageBuffer = await QRCode.toBuffer(qr, { width: 300, margin: 2 })
              this.emit('qr', qr)
              this.emit('qr-image', qrImageBuffer)
            } catch (err) {
              logger.error('WhatsApp', 'Failed to generate QR image', { error: err })
              this.emit('qr', qr)
            }
          }
          // If pairing code already requested, ignore subsequent QR events
        }

        if (connection === 'close') {
          this.status.connected = false
          this.isConnecting = false
          const error = lastDisconnect?.error as Boom
          const statusCode = error?.output?.statusCode
          const reason = DisconnectReason[statusCode] || `Unknown (${statusCode})`

          // Store disconnection reason in status
          this.status.disconnectReason = reason
          this.status.isReconnecting = false

          logger.warn('WhatsApp', `Disconnected: ${reason}`, { statusCode, reason })

          // Handle restartRequired - WhatsApp forces disconnect after successful pairing
          if (statusCode === DisconnectReason.restartRequired) {
            logger.info('WhatsApp', 'Restart required after pairing - reconnecting...')
            this.pairingCodeRequested = false // Reset for fresh connection
            setTimeout(() => this.connect(this.pendingPhoneNumber || undefined), 1000)
            return
          }

          if (statusCode === DisconnectReason.loggedOut) {
            // Session invalidated, need new pairing
            logger.warn('WhatsApp', 'Logged out - session invalidated. Need to re-pair.')
            this.status.error = 'Logged out from WhatsApp. Please reconnect with a new pairing code.'
            this.emit('logged-out')
            this.emit('disconnected', { reason, permanent: true })
            // Clear session files and retry connection with fresh session
            await this.clearSession()
            this.pairingCodeRequested = false // Reset for fresh pairing
            if (this.pendingPhoneNumber) {
              console.log('Retrying connection with fresh session...')
              setTimeout(() => this.connect(this.pendingPhoneNumber || undefined), 2000)
            }
          } else if (statusCode !== DisconnectReason.connectionClosed) {
            // Try to reconnect for other errors
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
              this.reconnectAttempts++
              this.status.isReconnecting = true
              const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000)
              console.log(`Attempting reconnect in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
              setTimeout(() => this.connect(this.pendingPhoneNumber || undefined), delay)
            } else {
              console.log('Max reconnect attempts reached')
              this.status.error = 'Connection lost. Max reconnect attempts reached.'
              this.emit('disconnected', { reason, permanent: true })
            }
          } else {
            // connectionClosed - emit once
            this.emit('disconnected', { reason, permanent: false })
          }
        }

        if (connection === 'open') {
          this.status.connected = true
          this.status.lastConnected = new Date()
          this.status.phoneNumber = this.socket?.user?.id?.split(':')[0]
          this.status.pairingCode = undefined
          this.status.qrCode = undefined
          this.status.error = undefined
          this.status.disconnectReason = undefined
          this.status.isReconnecting = false
          this.reconnectAttempts = 0
          this.isConnecting = false
          this.pendingPhoneNumber = null // Clear pending phone number after successful connection
          this.pairingCodeRequested = false
          logger.info('WhatsApp', `Connected successfully as ${this.status.phoneNumber}`, { phoneNumber: this.status.phoneNumber })
          this.emit('connected', { phoneNumber: this.status.phoneNumber })
        }
      })

      // Save credentials on update
      this.socket.ev.on('creds.update', saveCreds)

      // Store phone number for pairing code request (will be requested on QR event)
      if (!state.creds.registered && phoneNumber) {
        this.pendingPhoneNumber = phoneNumber
        this.pairingCodeRequested = false
        logger.info('WhatsApp', 'Waiting for QR event to request pairing code...', { phoneNumber })
      }

      // Return null - pairing code will be emitted via 'pairing-code' event when ready
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
      // Reset pairing state
      this.pairingCodeRequested = false
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
      this.pendingPhoneNumber = null
      this.pairingCodeRequested = false
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
      logger.error('WhatsApp', 'Cannot send message: WhatsApp not connected')
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
      logger.info('WhatsApp', `Message sent to ${targetJid}`, { jid: targetJid, preview: text.substring(0, 50), messageId: result?.key?.id })
      this.emit('message-sent', { jid: targetJid, text, messageId: result?.key?.id })
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('WhatsApp', `Failed to send message to ${targetJid}`, { jid: targetJid, error: errorMessage })
      this.emit('message-failed', { jid: targetJid, text, error: errorMessage })
      return false
    }
  }

  /**
   * Sends an image message with optional caption to a WhatsApp group or individual chat.
   *
   * @param jid - The WhatsApp JID (group: xxx@g.us, individual: xxx@s.whatsapp.net)
   * @param imageSource - URL of the image to send, or a Buffer containing the image data
   * @param caption - Optional caption for the image
   * @param fallbackToText - If true, sends caption as text if image fetch fails (default: true)
   * @returns true if message was sent successfully, false otherwise
   */
  async sendImageMessage(
    jid: string,
    imageSource: string | Buffer,
    caption?: string,
    fallbackToText = true
  ): Promise<boolean> {
    if (!this.isConnected() || !this.socket) {
      logger.error('WhatsApp', 'Cannot send image: WhatsApp not connected')
      this.emit('message-failed', { jid, type: 'image', error: 'Not connected' })
      return false
    }

    // Normalize group ID format
    let targetJid = jid
    if (!jid.includes('@')) {
      targetJid = `${jid}@g.us`
    }

    try {
      let buffer: Buffer

      if (Buffer.isBuffer(imageSource)) {
        buffer = imageSource
      } else {
        // Fetch image from URL
        const response = await fetch(imageSource)
        if (!response.ok) {
          throw new Error(`Failed to fetch image: HTTP ${response.status}`)
        }

        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.startsWith('image/')) {
          throw new Error(`Invalid content type: ${contentType}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        buffer = Buffer.from(arrayBuffer)
      }

      // Send image via WhatsApp
      const result = await this.socket.sendMessage(targetJid, {
        image: buffer,
        caption: caption || undefined,
      })

      logger.info('WhatsApp', `Image sent to ${targetJid}`, { jid: targetJid, hasCaption: !!caption, messageId: result?.key?.id })
      this.emit('message-sent', { jid: targetJid, type: 'image', caption, messageId: result?.key?.id })
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('WhatsApp', `Failed to send image to ${targetJid}`, { jid: targetJid, error: errorMessage })

      // Fallback to text message if enabled and caption provided
      if (fallbackToText && caption) {
        logger.info('WhatsApp', `Falling back to text message for ${targetJid}`)
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

  /**
   * Fetches all WhatsApp groups the connected account is part of.
   * Includes group images and community hierarchy information.
   *
   * @returns Array of WhatsAppGroup objects with community hierarchy info
   */
  async getGroups(): Promise<WhatsAppGroup[]> {
    if (!this.isConnected() || !this.socket) {
      console.error('Cannot fetch groups: WhatsApp not connected')
      return []
    }

    try {
      const groups = await this.socket.groupFetchAllParticipating()
      const result: WhatsAppGroup[] = []

      for (const [id, metadata] of Object.entries(groups)) {
        let image: string | undefined

        // Try to fetch group image
        try {
          image = await this.socket.profilePictureUrl(id, 'image')
        } catch {
          // Group may not have an image, that's ok
        }

        result.push({
          id,
          name: metadata.subject,
          image,
          isCommunity: metadata.isCommunity || false,
          isCommunityAnnounce: metadata.isCommunityAnnounce || false,
          linkedParent: metadata.linkedParent || undefined,
          participantCount: metadata.participants?.length || 0,
        })
      }

      console.log(`Fetched ${result.length} WhatsApp groups`)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Failed to fetch groups:', errorMessage)
      return []
    }
  }
}

// Singleton instance
export const whatsappClient = new WhatsAppClient()
