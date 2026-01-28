<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { apiClient, type LogEntry, type LogLevel } from '../api/client'

const loading = ref(true)
const error = ref<string | null>(null)
const logs = ref<LogEntry[]>([])
const totalLogs = ref(0)
const selectedLevel = ref<LogLevel | ''>('')
const selectedCategory = ref('')
const clearing = ref(false)

let refreshInterval: ReturnType<typeof setInterval> | null = null

const categories = computed(() => {
  const cats = new Set<string>()
  logs.value.forEach(log => cats.add(log.category))
  return Array.from(cats).sort()
})

async function loadLogs() {
  try {
    const response = await apiClient.getLogs({
      level: selectedLevel.value || undefined,
      category: selectedCategory.value || undefined,
      limit: 200,
    })
    if (response.success) {
      logs.value = response.data.logs
      totalLogs.value = response.data.total
    } else {
      error.value = response.error
    }
  } catch {
    error.value = 'Failed to load logs'
  } finally {
    loading.value = false
  }
}

async function clearLogs() {
  if (!confirm('Are you sure you want to clear all logs?')) return

  clearing.value = true
  try {
    const response = await apiClient.clearLogs()
    if (response.success) {
      logs.value = []
      totalLogs.value = 0
    } else {
      error.value = response.error
    }
  } catch {
    error.value = 'Failed to clear logs'
  } finally {
    clearing.value = false
  }
}

function formatTimestamp(log: LogEntry): string {
  if (log.timestampNs) {
    // Convert nanosecond string to date + sub-ms precision
    const ns = BigInt(log.timestampNs)
    const ms = Number(ns / 1_000_000n)
    const subMs = ns % 1_000_000n // remaining nanoseconds after ms
    const date = new Date(ms)
    const dateStr = date.toLocaleString()
    const millis = date.getMilliseconds().toString().padStart(3, '0')
    const micros = Number(subMs / 1_000n).toString().padStart(3, '0')
    return `${dateStr}.${millis}.${micros}`
  }
  return new Date(log.timestamp).toLocaleString()
}

function getLevelClass(level: LogLevel): string {
  switch (level) {
    case 'debug': return 'bg-gray-100 text-gray-800'
    case 'info': return 'bg-blue-100 text-blue-800'
    case 'warn': return 'bg-yellow-100 text-yellow-800'
    case 'error': return 'bg-red-100 text-red-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

function formatData(data: Record<string, unknown> | undefined): string {
  if (!data) return ''
  return JSON.stringify(data, null, 2)
}

onMounted(() => {
  loadLogs()
  refreshInterval = setInterval(loadLogs, 3000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-bold">Logs</h2>
      <button
        @click="clearLogs"
        :disabled="clearing || logs.length === 0"
        class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ clearing ? 'Clearing...' : 'Clear Logs' }}
      </button>
    </div>

    <div v-if="loading" class="text-gray-500">Loading...</div>

    <div v-else-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
      {{ error }}
    </div>

    <div v-else class="space-y-6">
      <!-- Filters -->
      <div class="bg-white rounded-lg shadow p-4 flex gap-4 items-center">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Level</label>
          <select
            v-model="selectedLevel"
            @change="loadLogs"
            class="block w-40 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">All levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            v-model="selectedCategory"
            @change="loadLogs"
            class="block w-48 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">All categories</option>
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>
        <div class="ml-auto text-sm text-gray-500">
          {{ logs.length }} / {{ totalLogs }} logs
        </div>
      </div>

      <!-- Logs Table -->
      <div class="bg-white rounded-lg shadow">
        <div v-if="logs.length === 0" class="text-gray-500 text-center py-8">
          No logs available
        </div>

        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-52">Time</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Level</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Category</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="log in logs" :key="log.id" class="hover:bg-gray-50">
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 font-mono">
                  {{ formatTimestamp(log) }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm">
                  <span
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                    :class="getLevelClass(log.level)"
                  >
                    {{ log.level }}
                  </span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {{ log.category }}
                </td>
                <td class="px-4 py-3 text-sm text-gray-900">
                  <div>{{ log.message }}</div>
                  <pre v-if="log.data" class="mt-1 text-xs text-gray-500 bg-gray-100 p-2 rounded overflow-x-auto max-w-xl">{{ formatData(log.data) }}</pre>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Auto-refresh indicator -->
      <div class="text-center text-sm text-gray-400">
        Auto-refreshing every 3 seconds
      </div>
    </div>
  </div>
</template>
