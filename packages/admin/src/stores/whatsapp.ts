import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface WhatsAppStatus {
  connected: boolean
  phoneNumber?: string
  lastConnected?: string
}

export const useWhatsAppStore = defineStore('whatsapp', () => {
  const status = ref<WhatsAppStatus | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchStatus() {
    loading.value = true
    error.value = null
    // TODO: Implement API call
    loading.value = false
  }

  async function connect() {
    loading.value = true
    error.value = null
    // TODO: Implement API call
    loading.value = false
  }

  return {
    status,
    loading,
    error,
    fetchStatus,
    connect,
  }
})
