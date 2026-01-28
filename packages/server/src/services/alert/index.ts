import nodemailer from 'nodemailer'
import { config } from '../../config.js'
import { whatsappClient } from '../whatsapp/client.js'

interface AlertResult {
  channel: string
  success: boolean
  error?: string
}

/**
 * Alert service for multi-channel notifications.
 * Supports email (SMTP), Telegram, and Discord.
 * Each channel operates independently (NFR12).
 */
class AlertService {
  private initialized = false
  private emailTransporter: nodemailer.Transporter | null = null

  /**
   * Initialize the alert service.
   * Sets up email transporter and wires WhatsApp disconnect events.
   */
  initialize(): void {
    if (this.initialized) {
      console.log('AlertService already initialized')
      return
    }

    // Initialize email transporter if configured
    if (config.smtpHost && config.smtpUser && config.alertEmail) {
      this.emailTransporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
      })
      console.log('AlertService: Email alerts configured')
    }

    // Wire WhatsApp disconnect event (handles all disconnection scenarios including logout)
    whatsappClient.on('disconnected', (data: { reason: string; permanent: boolean }) => {
      this.handleDisconnection(data.reason, data.permanent)
    })

    // Wire pairing code event
    whatsappClient.on('pairing-code', (code: string) => {
      this.sendPairingCodeAlert(code)
    })

    // Wire QR code image event
    whatsappClient.on('qr-image', (imageBuffer: Buffer) => {
      this.sendQRCodeAlert(imageBuffer)
    })

    this.initialized = true
    console.log('AlertService initialized')
  }

  /**
   * Handle WhatsApp disconnection event.
   */
  private async handleDisconnection(reason: string, permanent: boolean): Promise<void> {
    console.log(`AlertService: WhatsApp disconnected (reason: ${reason}, permanent: ${permanent})`)

    // Get pairing code for reconnection (if available)
    const status = whatsappClient.getStatus()
    const pairingCode = status.pairingCode

    await this.sendDisconnectionAlert(reason, pairingCode)
  }

  /**
   * Send disconnection alert to all configured channels.
   */
  async sendDisconnectionAlert(reason: string, pairingCode?: string): Promise<AlertResult[]> {
    const timestamp = new Date().toISOString()
    const subject = '[Jellyfin Notifier] WhatsApp Disconnected'
    const message = this.formatDisconnectionMessage(reason, timestamp, pairingCode)

    console.log('AlertService: Sending disconnection alerts')

    // Send to all channels in parallel, don't fail if one fails (NFR12)
    const results = await Promise.allSettled([
      this.sendEmail(subject, message),
      this.sendTelegram(message),
      this.sendDiscord(subject, message),
    ])

    const alertResults: AlertResult[] = [
      this.processResult(results[0], 'email'),
      this.processResult(results[1], 'telegram'),
      this.processResult(results[2], 'discord'),
    ]

    // Log results
    for (const result of alertResults) {
      if (result.success) {
        console.log(`AlertService: ${result.channel} alert sent successfully`)
      } else if (result.error !== 'Not configured') {
        console.error(`AlertService: ${result.channel} alert failed: ${result.error}`)
      }
    }

    return alertResults
  }

  /**
   * Format the disconnection alert message.
   */
  private formatDisconnectionMessage(reason: string, timestamp: string, pairingCode?: string): string {
    let message = `WhatsApp Disconnected

Reason: ${reason}
Time: ${timestamp}
`

    if (pairingCode) {
      message += `
To reconnect, use pairing code: ${pairingCode}
Enter this code in WhatsApp > Linked Devices > Link a Device
`
    }

    message += `
Admin dashboard: ${config.publicUrl}
`

    return message
  }

  /**
   * Send email alert via SMTP.
   */
  private async sendEmail(subject: string, message: string): Promise<void> {
    if (!this.emailTransporter || !config.alertEmail) {
      throw new Error('Not configured')
    }

    await this.emailTransporter.sendMail({
      from: config.smtpUser,
      to: config.alertEmail,
      subject,
      text: message,
    })
  }

  /**
   * Send Telegram alert via Bot API.
   */
  private async sendTelegram(message: string): Promise<void> {
    if (!config.telegramBotToken || !config.telegramChatId) {
      throw new Error('Not configured')
    }

    const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: message,
        parse_mode: 'HTML',
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Telegram API error: ${error}`)
    }
  }

  /**
   * Send Discord alert via webhook.
   */
  private async sendDiscord(title: string, message: string): Promise<void> {
    if (!config.discordWebhookUrl) {
      throw new Error('Not configured')
    }

    const response = await fetch(config.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title,
            description: message,
            color: 15158332, // Red color
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Discord webhook error: ${error}`)
    }
  }

  /**
   * Process a PromiseSettledResult into an AlertResult.
   */
  private processResult(result: PromiseSettledResult<void>, channel: string): AlertResult {
    if (result.status === 'fulfilled') {
      return { channel, success: true }
    }

    const error = result.reason instanceof Error ? result.reason.message : String(result.reason)
    return { channel, success: false, error }
  }

  /**
   * Send pairing code alert to all configured channels.
   * Called when a new WhatsApp pairing code is generated.
   */
  async sendPairingCodeAlert(code: string): Promise<AlertResult[]> {
    const timestamp = new Date().toISOString()
    const subject = '[Jellyfin Notifier] WhatsApp Pairing Code'
    const message = this.formatPairingCodeMessage(code, timestamp)

    console.log('AlertService: Sending pairing code alerts')

    // Send to all channels in parallel, don't fail if one fails (NFR12)
    const results = await Promise.allSettled([
      this.sendEmail(subject, message),
      this.sendTelegram(message),
      this.sendDiscord(subject, message),
    ])

    const alertResults: AlertResult[] = [
      this.processResult(results[0], 'email'),
      this.processResult(results[1], 'telegram'),
      this.processResult(results[2], 'discord'),
    ]

    // Log results
    for (const result of alertResults) {
      if (result.success) {
        console.log(`AlertService: ${result.channel} pairing code alert sent successfully`)
      } else if (result.error !== 'Not configured') {
        console.error(`AlertService: ${result.channel} pairing code alert failed: ${result.error}`)
      }
    }

    return alertResults
  }

  /**
   * Format the pairing code alert message.
   */
  private formatPairingCodeMessage(code: string, timestamp: string): string {
    return `WhatsApp Pairing Code

═══════════════════════════════════════
Your pairing code is: ${code}
═══════════════════════════════════════

To link your WhatsApp:
1. Open WhatsApp on your phone
2. Go to Settings > Linked Devices
3. Tap "Link a Device"
4. Enter the code above

Time: ${timestamp}
Admin dashboard: ${config.publicUrl}
`
  }

  /**
   * Send QR code alert with image to all configured channels.
   * Called when a new WhatsApp QR code is generated.
   */
  async sendQRCodeAlert(imageBuffer: Buffer): Promise<AlertResult[]> {
    const timestamp = new Date().toISOString()
    const subject = '[Jellyfin Notifier] WhatsApp QR Code'
    const message = `WhatsApp QR Code

Scan this QR code to link WhatsApp:
1. Open WhatsApp on your phone
2. Go to Settings > Linked Devices
3. Tap "Link a Device"
4. Scan the QR code

Time: ${timestamp}
Admin dashboard: ${config.publicUrl}`

    console.log('AlertService: Sending QR code alerts')

    // Send to all channels in parallel, don't fail if one fails (NFR12)
    const results = await Promise.allSettled([
      this.sendEmailWithImage(subject, message, imageBuffer),
      this.sendTelegramWithImage(message, imageBuffer),
      this.sendDiscordWithImage(subject, message, imageBuffer),
    ])

    const alertResults: AlertResult[] = [
      this.processResult(results[0], 'email'),
      this.processResult(results[1], 'telegram'),
      this.processResult(results[2], 'discord'),
    ]

    // Log results
    for (const result of alertResults) {
      if (result.success) {
        console.log(`AlertService: ${result.channel} QR code alert sent successfully`)
      } else if (result.error !== 'Not configured') {
        console.error(`AlertService: ${result.channel} QR code alert failed: ${result.error}`)
      }
    }

    return alertResults
  }

  /**
   * Send email with image attachment.
   */
  private async sendEmailWithImage(subject: string, message: string, imageBuffer: Buffer): Promise<void> {
    if (!this.emailTransporter || !config.alertEmail) {
      throw new Error('Not configured')
    }

    await this.emailTransporter.sendMail({
      from: config.smtpUser,
      to: config.alertEmail,
      subject,
      text: message,
      attachments: [
        {
          filename: 'whatsapp-qr.png',
          content: imageBuffer,
          cid: 'qrcode',
        },
      ],
      html: `<p>${message.replace(/\n/g, '<br>')}</p><img src="cid:qrcode" alt="QR Code" />`,
    })
  }

  /**
   * Send Telegram message with image.
   */
  private async sendTelegramWithImage(caption: string, imageBuffer: Buffer): Promise<void> {
    if (!config.telegramBotToken || !config.telegramChatId) {
      throw new Error('Not configured')
    }

    const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendPhoto`

    // Use FormData for multipart upload
    const formData = new FormData()
    formData.append('chat_id', config.telegramChatId)
    formData.append('caption', caption)
    formData.append('photo', new Blob([imageBuffer], { type: 'image/png' }), 'qrcode.png')

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Telegram API error: ${error}`)
    }
  }

  /**
   * Send Discord message with image.
   */
  private async sendDiscordWithImage(title: string, message: string, imageBuffer: Buffer): Promise<void> {
    if (!config.discordWebhookUrl) {
      throw new Error('Not configured')
    }

    // Use FormData for multipart upload with embed
    const formData = new FormData()

    const payload = {
      embeds: [
        {
          title,
          description: message,
          color: 3447003, // Blue color
          timestamp: new Date().toISOString(),
          image: {
            url: 'attachment://qrcode.png',
          },
        },
      ],
    }

    formData.append('payload_json', JSON.stringify(payload))
    formData.append('files[0]', new Blob([imageBuffer], { type: 'image/png' }), 'qrcode.png')

    const response = await fetch(config.discordWebhookUrl, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Discord webhook error: ${error}`)
    }
  }

  /**
   * Test alert channels by sending a test message.
   */
  async testAlerts(): Promise<AlertResult[]> {
    const subject = '[Jellyfin Notifier] Test Alert'
    const message = `This is a test alert from Jellyfin Multi Notifier.

Time: ${new Date().toISOString()}
Admin dashboard: ${config.publicUrl}

If you received this message, alerts are working correctly.`

    const results = await Promise.allSettled([
      this.sendEmail(subject, message),
      this.sendTelegram(message),
      this.sendDiscord(subject, message),
    ])

    return [
      this.processResult(results[0], 'email'),
      this.processResult(results[1], 'telegram'),
      this.processResult(results[2], 'discord'),
    ]
  }

  /**
   * Check which alert channels are configured.
   */
  getConfiguredChannels(): { email: boolean; telegram: boolean; discord: boolean } {
    return {
      email: !!(config.smtpHost && config.smtpUser && config.alertEmail),
      telegram: !!(config.telegramBotToken && config.telegramChatId),
      discord: !!config.discordWebhookUrl,
    }
  }
}

// Singleton instance
export const alertService = new AlertService()
