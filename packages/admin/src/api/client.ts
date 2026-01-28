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

export interface AggregationStatus {
  movies: {
    count: number
    windowStart: string | null
    items: Array<{ title: string; type: string }>
  }
  series: {
    count: number
    windowStart: string | null
    items: Array<{ title: string; type: string }>
  }
  windowDurationMinutes: number
}

export interface AlertChannels {
  email: boolean
  telegram: boolean
  discord: boolean
}

export interface ConfigStatus {
  jellyfinUrl: string
  whatsappGroupId: string | null
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

export interface NotificationRecord {
  timestamp: string
  type: 'movies' | 'series'
  count: number
  success: boolean
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
}
