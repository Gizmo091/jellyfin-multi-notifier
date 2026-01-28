// API Response Types
export interface ApiSuccessResponse<T> {
  success: true
  data: T
}

export interface ApiErrorResponse {
  success: false
  error: string
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

// Notification Channel Types
export type ChannelType = 'whatsapp' | 'discord' | 'telegram'

export type SupportedLanguage = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt'

export interface NotificationChannelConfig {
  telegramBotToken?: string
}

export interface NotificationChannel {
  id: string
  channelType: ChannelType
  target: string // group_id | webhook_url | chat_id
  displayName: string
  language: SupportedLanguage
  config?: NotificationChannelConfig
  enabled: boolean
  createdAt: string
}

// Media Types
export type MediaType = 'movie' | 'series' | 'episode'

export interface MediaEvent {
  id: string
  type: MediaType
  title: string
  year?: number
  coverUrl?: string
  jellyfinId: string
  eventType: 'added' | 'removed'
  timestamp: Date
  redirectUrl?: string
}

// WhatsApp Types
export interface WhatsAppStatus {
  connected: boolean
  phoneNumber?: string
  lastConnected?: Date
  pairingCode?: string
  error?: string
  disconnectReason?: string
  isReconnecting?: boolean
}

// Queue Types
export interface QueueMessage {
  id: number
  content: string
  mediaType: MediaType
  status: 'pending' | 'sent' | 'failed'
  retryCount: number
  createdAt: Date
  updatedAt: Date
}

// Config Types (runtime)
export interface ServiceConfig {
  jellyfinUrl: string
  webhookSecret: string
  whatsappGroupId: string
  aggregationWindowMinutes: number
}

// Jellyfin Webhook Types
export interface JellyfinWebhookPayload {
  NotificationType?: string
  ServerId?: string
  ServerName?: string
  ServerUrl?: string
  Item?: JellyfinItem
  User?: JellyfinUser
  [key: string]: unknown
}

export interface JellyfinItem {
  Id?: string
  Name?: string
  Type?: string
  ProductionYear?: number
  SeriesName?: string
  SeasonName?: string
  IndexNumber?: number
  ParentIndexNumber?: number
  ImageTags?: Record<string, string>
  [key: string]: unknown
}

export interface JellyfinUser {
  Id?: string
  Name?: string
  [key: string]: unknown
}

// Webhook Response Types
export interface WebhookReceivedResponse {
  received: true
  timestamp: string
}
