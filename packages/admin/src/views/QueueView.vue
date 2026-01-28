<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { apiClient, type QueueStatus, type AggregationStatus } from '../api/client'

const loading = ref(true)
const error = ref<string | null>(null)
const queueStatus = ref<QueueStatus | null>(null)
const aggregation = ref<AggregationStatus | null>(null)
const flushing = ref(false)
const now = ref(Date.now())

let refreshInterval: ReturnType<typeof setInterval> | null = null
let countdownInterval: ReturnType<typeof setInterval> | null = null

async function loadData() {
  try {
    const [queueResponse, aggResponse] = await Promise.all([
      apiClient.getQueue(),
      apiClient.getAggregation(),
    ])
    if (queueResponse.success) {
      queueStatus.value = queueResponse.data
    } else {
      error.value = queueResponse.error
    }
    if (aggResponse.success) {
      aggregation.value = aggResponse.data
    }
  } catch {
    error.value = 'Failed to load queue'
  } finally {
    loading.value = false
  }
}

async function flushAggregation() {
  flushing.value = true
  try {
    await apiClient.flushAggregation()
    await loadData()
  } catch {
    error.value = 'Failed to flush aggregation'
  } finally {
    flushing.value = false
  }
}

const cancellingWindow = ref<string | null>(null)

async function cancelAggregation(type: 'movies' | 'series' | 'movies-removed' | 'series-removed') {
  cancellingWindow.value = type
  try {
    const response = await apiClient.cancelAggregation(type)
    if (response.success) {
      await loadData()
    } else {
      error.value = response.error
    }
  } catch {
    error.value = 'Failed to cancel aggregation'
  } finally {
    cancellingWindow.value = null
  }
}

function formatCountdown(windowStart: string, windowDurationMinutes: number): string {
  const endMs = new Date(windowStart).getTime() + windowDurationMinutes * 60000
  const remainingMs = endMs - now.value
  if (remainingMs <= 0) return 'Flushing...'
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const hasAggregationItems = computed(() => {
  if (!aggregation.value) return false
  const a = aggregation.value
  return a.movies.count > 0 || a.series.count > 0 || a.moviesRemoved.count > 0 || a.seriesRemoved.count > 0
})

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString()
}

onMounted(() => {
  loadData()
  refreshInterval = setInterval(loadData, 5000)
  countdownInterval = setInterval(() => { now.value = Date.now() }, 1000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
  if (countdownInterval) clearInterval(countdownInterval)
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
      <!-- Pending Notifications (Aggregation) -->
      <div v-if="hasAggregationItems" class="bg-white rounded-lg shadow p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-semibold">Pending Notifications</h3>
          <button
            @click="flushAggregation"
            :disabled="flushing"
            class="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {{ flushing ? 'Flushing...' : 'Flush Now' }}
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Movies window -->
          <div v-if="aggregation && aggregation.movies.count > 0" class="border border-blue-200 rounded-lg p-4 bg-blue-50">
            <div class="flex justify-between items-center mb-2">
              <span class="font-medium text-blue-800">Movies ({{ aggregation.movies.count }})</span>
              <div class="flex items-center gap-2">
                <span v-if="aggregation.movies.windowStart" class="text-sm font-mono text-blue-600">
                  {{ formatCountdown(aggregation.movies.windowStart, aggregation.movies.windowDurationMinutes) }}
                </span>
                <button
                  @click="cancelAggregation('movies')"
                  :disabled="cancellingWindow === 'movies'"
                  class="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                >
                  {{ cancellingWindow === 'movies' ? '...' : 'Cancel' }}
                </button>
              </div>
            </div>
            <ul class="text-sm text-blue-700 space-y-1">
              <li v-for="(item, idx) in aggregation.movies.items" :key="idx" class="truncate">
                {{ item.title }}
              </li>
            </ul>
          </div>

          <!-- Series window -->
          <div v-if="aggregation && aggregation.series.count > 0" class="border border-purple-200 rounded-lg p-4 bg-purple-50">
            <div class="flex justify-between items-center mb-2">
              <span class="font-medium text-purple-800">Series ({{ aggregation.series.count }})</span>
              <div class="flex items-center gap-2">
                <span v-if="aggregation.series.windowStart" class="text-sm font-mono text-purple-600">
                  {{ formatCountdown(aggregation.series.windowStart, aggregation.series.windowDurationMinutes) }}
                </span>
                <button
                  @click="cancelAggregation('series')"
                  :disabled="cancellingWindow === 'series'"
                  class="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                >
                  {{ cancellingWindow === 'series' ? '...' : 'Cancel' }}
                </button>
              </div>
            </div>
            <ul class="text-sm text-purple-700 space-y-1">
              <li v-for="(item, idx) in aggregation.series.items" :key="idx" class="truncate">
                {{ item.title }}
              </li>
            </ul>
          </div>

          <!-- Movies removed window -->
          <div v-if="aggregation && aggregation.moviesRemoved.count > 0" class="border border-red-200 rounded-lg p-4 bg-red-50">
            <div class="flex justify-between items-center mb-2">
              <span class="font-medium text-red-800">Movies removed ({{ aggregation.moviesRemoved.count }})</span>
              <div class="flex items-center gap-2">
                <span v-if="aggregation.moviesRemoved.windowStart" class="text-sm font-mono text-red-600">
                  {{ formatCountdown(aggregation.moviesRemoved.windowStart, aggregation.moviesRemoved.windowDurationMinutes) }}
                </span>
                <button
                  @click="cancelAggregation('movies-removed')"
                  :disabled="cancellingWindow === 'movies-removed'"
                  class="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                >
                  {{ cancellingWindow === 'movies-removed' ? '...' : 'Cancel' }}
                </button>
              </div>
            </div>
            <ul class="text-sm text-red-700 space-y-1">
              <li v-for="(item, idx) in aggregation.moviesRemoved.items" :key="idx" class="truncate">
                {{ item.title }}
              </li>
            </ul>
          </div>

          <!-- Series removed window -->
          <div v-if="aggregation && aggregation.seriesRemoved.count > 0" class="border border-orange-200 rounded-lg p-4 bg-orange-50">
            <div class="flex justify-between items-center mb-2">
              <span class="font-medium text-orange-800">Series removed ({{ aggregation.seriesRemoved.count }})</span>
              <div class="flex items-center gap-2">
                <span v-if="aggregation.seriesRemoved.windowStart" class="text-sm font-mono text-orange-600">
                  {{ formatCountdown(aggregation.seriesRemoved.windowStart, aggregation.seriesRemoved.windowDurationMinutes) }}
                </span>
                <button
                  @click="cancelAggregation('series-removed')"
                  :disabled="cancellingWindow === 'series-removed'"
                  class="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                >
                  {{ cancellingWindow === 'series-removed' ? '...' : 'Cancel' }}
                </button>
              </div>
            </div>
            <ul class="text-sm text-orange-700 space-y-1">
              <li v-for="(item, idx) in aggregation.seriesRemoved.items" :key="idx" class="truncate">
                {{ item.title }}
              </li>
            </ul>
          </div>
        </div>
      </div>

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
