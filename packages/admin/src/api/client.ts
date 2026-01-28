interface ApiSuccessResponse<T> {
  success: true
  data: T
}

interface ApiErrorResponse {
  success: false
  error: string
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

const BASE_URL = '/api'

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    const data = await response.json()
    return data as ApiResponse<T>
  } catch {
    return { success: false, error: 'Network error' }
  }
}

export interface WhatsAppStatus {
  connected: boolean
  phoneNumber?: string
  lastConnected?: string
  pairingCode?: string
  qrCode?: string
  error?: string
  disconnectReason?: string
  isReconnecting?: boolean
}

export interface QueueStatus {
  status: {
    pending: number
    sent: number
    failed: number
    total: number
  }
  messages: Array<{
    id: number
    content: string
    mediaType: string
    status: string
    retryCount: number
    createdAt: string
  }>
}

export interface AggregationWindowStatus {
  count: number
  windowStart: string | null
  items: Array<{ title: string; type: string }>
}

export interface AggregationStatus {
  movies: AggregationWindowStatus
  series: AggregationWindowStatus
  moviesRemoved: AggregationWindowStatus
  seriesRemoved: AggregationWindowStatus
  windowDurationMinutes: number
}

export interface AlertChannels {
  email: boolean
  telegram: boolean
  discord: boolean
}

export type SupportedLanguage = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt'

export interface WhatsAppGroupConfig {
  id: string
  groupId: string
  groupName: string
  language: SupportedLanguage
}

export interface ConfigStatus {
  jellyfinUrl: string
  whatsappGroupId: string | null // Deprecated
  whatsappGroups: WhatsAppGroupConfig[]
  supportedLanguages: { code: string; name: string }[]
  aggregationWindowMinutes: number
  publicUrl: string
  alerts: {
    emailConfigured: boolean
    telegramConfigured: boolean
    discordConfigured: boolean
  }
}

export interface WhatsAppGroup {
  id: string
  name: string
  image?: string
  isCommunity: boolean
  linkedParent?: string
  participantCount: number
}

export interface WhatsAppGroupsResponse {
  communities: Array<{
    id: string
    name: string
    image?: string
    groups: WhatsAppGroup[]
  }>
  standaloneGroups: WhatsAppGroup[]
}

export interface AlertTestResult {
  channel: string
  success: boolean
  error?: string
}

export interface WebhookConfig {
  webhookUrl: string
  webhookSecret: string
  secretConfigured: boolean
  template: string
  notificationTypes: string[]
}

export interface TestWebhookResult {
  event: {
    id: string
    type: string
    title: string
    year?: number
    jellyfinId: string
    eventType: string
    timestamp: string
  }
  flushed: boolean
}

export interface NotificationRecord {
  timestamp: string
  type: 'movies' | 'series'
  count: number
  success: boolean
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: number
  timestamp: string
  /** High-resolution timestamp in nanoseconds (as string) */
  timestampNs?: string
  level: LogLevel
  category: string
  message: string
  data?: Record<string, unknown>
}

export interface LogsResponse {
  logs: LogEntry[]
  total: number
}

export interface ServiceStatus {
  uptime: {
    seconds: number
    formatted: string
  }
  startTime: string
  whatsapp: {
    connected: boolean
    phoneNumber?: string
  }
  queue: {
    pending: number
    failed: number
    total: number
  }
  aggregation: {
    moviesCount: number
    seriesCount: number
  }
  lastNotification: NotificationRecord | null
  recentNotifications: NotificationRecord[]
}

export const apiClient = {
  async getHealth(): Promise<ApiResponse<{ status: string }>> {
    try {
      const response = await fetch('/health', { credentials: 'include' })
      const data = await response.json()
      return data as ApiResponse<{ status: string }>
    } catch {
      return { success: false, error: 'Network error' }
    }
  },

  async getWhatsAppStatus(): Promise<ApiResponse<WhatsAppStatus>> {
    return request<WhatsAppStatus>('/whatsapp/status')
  },

  async connectWhatsApp(phoneNumber: string): Promise<ApiResponse<{ pairingCode: string }>> {
    return request<{ pairingCode: string }>('/whatsapp/connect', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    })
  },

  async connectWhatsAppQR(): Promise<ApiResponse<{ message: string; qrCode?: string }>> {
    return request<{ message: string; qrCode?: string }>('/whatsapp/connect-qr', {
      method: 'POST',
    })
  },

  async disconnectWhatsApp(): Promise<ApiResponse<{ message: string }>> {
    return request<{ message: string }>('/whatsapp/disconnect', {
      method: 'POST',
    })
  },

  async getQueue(): Promise<ApiResponse<QueueStatus>> {
    return request<QueueStatus>('/queue')
  },

  async getAggregation(): Promise<ApiResponse<AggregationStatus>> {
    return request<AggregationStatus>('/aggregation/status')
  },

  async flushAggregation(): Promise<ApiResponse<{ message: string }>> {
    return request<{ message: string }>('/aggregation/flush', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },

  async getAlertStatus(): Promise<ApiResponse<AlertChannels>> {
    return request<AlertChannels>('/alerts/status')
  },

  async testAlerts(): Promise<ApiResponse<{ results: AlertTestResult[] }>> {
    return request<{ results: AlertTestResult[] }>('/alerts/test', {
      method: 'POST',
    })
  },

  async getConfig(): Promise<ApiResponse<ConfigStatus>> {
    return request<ConfigStatus>('/config')
  },

  async getStatus(): Promise<ApiResponse<ServiceStatus>> {
    return request<ServiceStatus>('/status')
  },

  async getWhatsAppGroups(): Promise<ApiResponse<WhatsAppGroupsResponse>> {
    return request<WhatsAppGroupsResponse>('/whatsapp/groups')
  },

  async setWhatsAppGroup(groupId: string): Promise<ApiResponse<{ groupId: string }>> {
    return request<{ groupId: string }>('/config/whatsapp-group', {
      method: 'POST',
      body: JSON.stringify({ groupId }),
    })
  },

  async getWebhookConfig(): Promise<ApiResponse<WebhookConfig>> {
    return request<WebhookConfig>('/config/webhook')
  },

  async testWebhook(
    type: 'movie' | 'series',
    options?: { title?: string; year?: number; flushImmediately?: boolean }
  ): Promise<ApiResponse<TestWebhookResult>> {
    return request<TestWebhookResult>('/test/webhook', {
      method: 'POST',
      body: JSON.stringify({ type, ...options }),
    })
  },

  async addWhatsAppGroup(
    groupId: string,
    groupName: string,
    language: SupportedLanguage
  ): Promise<ApiResponse<WhatsAppGroupConfig>> {
    return request<WhatsAppGroupConfig>('/config/whatsapp-groups', {
      method: 'POST',
      body: JSON.stringify({ groupId, groupName, language }),
    })
  },

  async updateWhatsAppGroup(
    id: string,
    updates: { groupName?: string; language?: SupportedLanguage }
  ): Promise<ApiResponse<{ message: string }>> {
    return request<{ message: string }>(`/config/whatsapp-groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  },

  async removeWhatsAppGroup(id: string): Promise<ApiResponse<{ message: string }>> {
    return request<{ message: string }>(`/config/whatsapp-groups/${id}`, {
      method: 'DELETE',
    })
  },

  async getLogs(options?: {
    level?: LogLevel
    category?: string
    limit?: number
  }): Promise<ApiResponse<LogsResponse>> {
    const params = new URLSearchParams()
    if (options?.level) params.append('level', options.level)
    if (options?.category) params.append('category', options.category)
    if (options?.limit) params.append('limit', options.limit.toString())
    const query = params.toString()
    return request<LogsResponse>(`/logs${query ? `?${query}` : ''}`)
  },

  async clearLogs(): Promise<ApiResponse<{ message: string }>> {
    return request<{ message: string }>('/logs', {
      method: 'DELETE',
    })
  },
}
