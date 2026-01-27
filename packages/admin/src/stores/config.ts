import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ServiceConfig {
  jellyfinUrl: string
  whatsappGroupId: string
  aggregationWindowMinutes: number
}

export const useConfigStore = defineStore('config', () => {
  const config = ref<ServiceConfig | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchConfig() {
    loading.value = true
    error.value = null
    // TODO: Implement API call
    loading.value = false
  }

  async function updateConfig(_newConfig: Partial<ServiceConfig>) {
    loading.value = true
    error.value = null
    // TODO: Implement API call
    loading.value = false
  }

  return {
    config,
    loading,
    error,
    fetchConfig,
    updateConfig,
  }
})
