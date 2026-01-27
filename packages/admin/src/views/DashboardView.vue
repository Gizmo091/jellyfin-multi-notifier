<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiClient } from '../api/client'

const status = ref<{ status: string } | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const response = await apiClient.getHealth()
    if (response.success) {
      status.value = response.data
    } else {
      error.value = response.error
    }
  } catch (e) {
    error.value = 'Failed to connect to server'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">Dashboard</h2>

    <div v-if="loading" class="text-gray-500">Loading...</div>

    <div v-else-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
      {{ error }}
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold mb-2">Server Status</h3>
        <p class="text-green-600 font-medium">{{ status?.status }}</p>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold mb-2">WhatsApp</h3>
        <p class="text-gray-500">Not configured</p>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold mb-2">Queue</h3>
        <p class="text-gray-500">0 pending</p>
      </div>
    </div>
  </div>
</template>
