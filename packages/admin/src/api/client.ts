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

export const apiClient = {
  async getHealth(): Promise<ApiResponse<{ status: string }>> {
    // Use health endpoint directly, not under /api
    try {
      const response = await fetch('/health')
      const data = await response.json()
      return data as ApiResponse<{ status: string }>
    } catch {
      return { success: false, error: 'Network error' }
    }
  },

  async getConfig<T>(): Promise<ApiResponse<T>> {
    return request<T>('/config')
  },

  async updateConfig<T>(config: Partial<T>): Promise<ApiResponse<T>> {
    return request<T>('/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    })
  },

  async getWhatsAppStatus<T>(): Promise<ApiResponse<T>> {
    return request<T>('/whatsapp/status')
  },

  async getQueue<T>(): Promise<ApiResponse<T>> {
    return request<T>('/queue')
  },
}
