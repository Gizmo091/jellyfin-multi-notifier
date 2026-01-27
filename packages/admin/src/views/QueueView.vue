<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { apiClient, type QueueStatus } from '../api/client'

const loading = ref(true)
const error = ref<string | null>(null)
const queueStatus = ref<QueueStatus | null>(null)

let refreshInterval: ReturnType<typeof setInterval> | null = null

async function loadQueue() {
  try {
    const response = await apiClient.getQueue()
    if (response.success) {
      queueStatus.value = response.data
    } else {
      error.value = response.error
    }
  } catch {
    error.value = 'Failed to load queue'
  } finally {
    loading.value = false
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString()
}

onMounted(() => {
  loadQueue()
  refreshInterval = setInterval(loadQueue, 5000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">Message Queue</h2>

    <div v-if="loading" class="text-gray-500">Loading...</div>

    <div v-else-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
      {{ error }}
    </div>

    <div v-else-if="queueStatus" class="space-y-6">
      <!-- Queue Stats -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow p-4">
          <div class="text-sm text-gray-500">Total</div>
          <div class="text-2xl font-bold">{{ queueStatus.status.total }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <div class="text-sm text-gray-500">Pending</div>
          <div class="text-2xl font-bold" :class="queueStatus.status.pending > 0 ? 'text-yellow-600' : 'text-gray-600'">
            {{ queueStatus.status.pending }}
          </div>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <div class="text-sm text-gray-500">Sent</div>
          <div class="text-2xl font-bold text-green-600">{{ queueStatus.status.sent }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <div class="text-sm text-gray-500">Failed</div>
          <div class="text-2xl font-bold" :class="queueStatus.status.failed > 0 ? 'text-red-600' : 'text-gray-600'">
            {{ queueStatus.status.failed }}
          </div>
        </div>
      </div>

      <!-- Queue Messages -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold mb-4">Messages</h3>

        <div v-if="queueStatus.messages.length === 0" class="text-gray-500 text-center py-8">
          No messages in queue
        </div>

        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Retries</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="msg in queueStatus.messages" :key="msg.id" class="hover:bg-gray-50">
                <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                  #{{ msg.id }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {{ msg.mediaType }}
                  </span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm">
                  <span
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                    :class="{
                      'bg-yellow-100 text-yellow-800': msg.status === 'pending',
                      'bg-green-100 text-green-800': msg.status === 'sent',
                      'bg-red-100 text-red-800': msg.status === 'failed',
                    }"
                  >
                    {{ msg.status }}
                  </span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {{ msg.retryCount }} / 5
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {{ formatDate(msg.createdAt) }}
                </td>
                <td class="px-4 py-3 text-sm text-gray-600 max-w-md truncate">
                  {{ msg.content.substring(0, 100) }}{{ msg.content.length > 100 ? '...' : '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Auto-refresh indicator -->
      <div class="text-center text-sm text-gray-400">
        Auto-refreshing every 5 seconds
      </div>
    </div>
  </div>
</template>
