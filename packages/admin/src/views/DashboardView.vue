<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { apiClient, type WhatsAppStatus, type QueueStatus, type AggregationStatus, type ServiceStatus } from '../api/client'
import QRCode from 'qrcode'

const loading = ref(true)
const error = ref<string | null>(null)

const whatsappStatus = ref<WhatsAppStatus | null>(null)
const queueStatus = ref<QueueStatus | null>(null)
const aggregationStatus = ref<AggregationStatus | null>(null)
const serviceStatus = ref<ServiceStatus | null>(null)

const phoneNumber = ref('')
const connecting = ref(false)
const pairingCode = ref<string | null>(null)
const qrCodeDataUrl = ref<string | null>(null)
const connectingQR = ref(false)

let refreshInterval: ReturnType<typeof setInterval> | null = null

async function loadData() {
  try {
    const [waResponse, queueResponse, aggResponse, statusResponse] = await Promise.all([
      apiClient.getWhatsAppStatus(),
      apiClient.getQueue(),
      apiClient.getAggregation(),
      apiClient.getStatus(),
    ])

    if (waResponse.success) {
      whatsappStatus.value = waResponse.data
      if (waResponse.data.pairingCode) {
        pairingCode.value = waResponse.data.pairingCode
      }
      if (waResponse.data.qrCode) {
        generateQRCodeImage(waResponse.data.qrCode)
      } else {
        qrCodeDataUrl.value = null
      }
    }
    if (queueResponse.success) {
      queueStatus.value = queueResponse.data
    }
    if (aggResponse.success) {
      aggregationStatus.value = aggResponse.data
    }
    if (statusResponse.success) {
      serviceStatus.value = statusResponse.data
    }

    error.value = null
  } catch {
    error.value = 'Failed to load data'
  } finally {
    loading.value = false
  }
}

async function connectWhatsApp() {
  if (!phoneNumber.value) return

  connecting.value = true
  pairingCode.value = null
  qrCodeDataUrl.value = null

  const response = await apiClient.connectWhatsApp(phoneNumber.value)

  connecting.value = false

  if (response.success) {
    pairingCode.value = response.data.pairingCode
  } else {
    error.value = response.error
  }
}

async function connectWhatsAppQR() {
  connectingQR.value = true
  pairingCode.value = null
  qrCodeDataUrl.value = null
  error.value = null

  const response = await apiClient.connectWhatsAppQR()

  connectingQR.value = false

  if (response.success) {
    if (response.data.qrCode) {
      await generateQRCodeImage(response.data.qrCode)
    }
    // QR code will be updated via the status polling
  } else {
    error.value = response.error
  }
}

async function generateQRCodeImage(qrData: string) {
  try {
    qrCodeDataUrl.value = await QRCode.toDataURL(qrData, {
      width: 256,
      margin: 2,
    })
  } catch (err) {
    console.error('Failed to generate QR code:', err)
  }
}

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
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

onMounted(() => {
  loadData()
  refreshInterval = setInterval(loadData, 5000) // Refresh every 5 seconds
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">Dashboard</h2>

    <div v-if="loading" class="text-gray-500">Loading...</div>

    <div v-else-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
      {{ error }}
    </div>

    <div v-else class="space-y-6">
      <!-- Service Status Bar -->
      <div v-if="serviceStatus" class="bg-white rounded-lg shadow p-4 flex items-center justify-between">
        <div class="flex items-center space-x-6">
          <div class="flex items-center">
            <span class="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
            <span class="text-sm text-gray-600">Service Running</span>
          </div>
          <div class="text-sm text-gray-500">
            Uptime: <span class="font-medium text-gray-700">{{ serviceStatus.uptime.formatted }}</span>
          </div>
        </div>
        <div v-if="serviceStatus.lastNotification" class="text-sm text-gray-500">
          Last notification: <span class="font-medium text-gray-700">{{ formatTimeAgo(serviceStatus.lastNotification.timestamp) }}</span>
        </div>
      </div>

      <!-- Status Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- WhatsApp Status -->
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold mb-4">WhatsApp</h3>
          <div v-if="whatsappStatus" class="space-y-2">
            <div class="flex items-center">
              <span
                class="w-3 h-3 rounded-full mr-2"
                :class="whatsappStatus.connected ? 'bg-green-500' : 'bg-red-500'"
              ></span>
              <span :class="whatsappStatus.connected ? 'text-green-600' : 'text-red-600'">
                {{ whatsappStatus.connected ? 'Connected' : 'Disconnected' }}
              </span>
            </div>
            <div v-if="whatsappStatus.phoneNumber" class="text-sm text-gray-600">
              Phone: {{ whatsappStatus.phoneNumber }}
            </div>
            <div v-if="whatsappStatus.isReconnecting" class="text-sm text-yellow-600">
              Reconnecting...
            </div>
            <div v-if="whatsappStatus.disconnectReason" class="text-sm text-red-500">
              Reason: {{ whatsappStatus.disconnectReason }}
            </div>
          </div>
        </div>

        <!-- Queue Status -->
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold mb-4">Message Queue</h3>
          <div v-if="queueStatus" class="space-y-2">
            <div class="flex justify-between">
              <span class="text-gray-600">Pending:</span>
              <span class="font-medium" :class="queueStatus.status.pending > 0 ? 'text-yellow-600' : 'text-green-600'">
                {{ queueStatus.status.pending }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Failed:</span>
              <span class="font-medium" :class="queueStatus.status.failed > 0 ? 'text-red-600' : 'text-gray-600'">
                {{ queueStatus.status.failed }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Total:</span>
              <span class="font-medium">{{ queueStatus.status.total }}</span>
            </div>
          </div>
        </div>

        <!-- Aggregation Status -->
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold mb-4">Aggregation Windows</h3>
          <div v-if="aggregationStatus" class="space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-gray-600">Movies:</span>
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ aggregationStatus.movies.count }} pending</span>
                <button
                  v-if="aggregationStatus.movies.count > 0"
                  @click="cancelAggregation('movies')"
                  :disabled="cancellingWindow === 'movies'"
                  class="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                >
                  {{ cancellingWindow === 'movies' ? '...' : 'Cancel' }}
                </button>
              </div>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-600">Series:</span>
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ aggregationStatus.series.count }} pending</span>
                <button
                  v-if="aggregationStatus.series.count > 0"
                  @click="cancelAggregation('series')"
                  :disabled="cancellingWindow === 'series'"
                  class="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                >
                  {{ cancellingWindow === 'series' ? '...' : 'Cancel' }}
                </button>
              </div>
            </div>
            <div v-if="aggregationStatus.moviesRemoved.count > 0" class="flex justify-between items-center">
              <span class="text-gray-600">Movies Removed:</span>
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ aggregationStatus.moviesRemoved.count }} pending</span>
                <button
                  @click="cancelAggregation('movies-removed')"
                  :disabled="cancellingWindow === 'movies-removed'"
                  class="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                >
                  {{ cancellingWindow === 'movies-removed' ? '...' : 'Cancel' }}
                </button>
              </div>
            </div>
            <div v-if="aggregationStatus.seriesRemoved.count > 0" class="flex justify-between items-center">
              <span class="text-gray-600">Series Removed:</span>
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ aggregationStatus.seriesRemoved.count }} pending</span>
                <button
                  @click="cancelAggregation('series-removed')"
                  :disabled="cancellingWindow === 'series-removed'"
                  class="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                >
                  {{ cancellingWindow === 'series-removed' ? '...' : 'Cancel' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- WhatsApp Connection -->
      <div v-if="!whatsappStatus?.connected" class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold mb-4">Connect WhatsApp</h3>

        <!-- QR Code Display -->
        <div v-if="qrCodeDataUrl" class="bg-white border border-gray-200 rounded-lg p-6 mb-4 text-center">
          <p class="text-sm text-gray-600 mb-4">Scan this QR code with WhatsApp:</p>
          <img :src="qrCodeDataUrl" alt="WhatsApp QR Code" class="mx-auto mb-4" />
          <p class="text-xs text-gray-500">WhatsApp > Linked Devices > Link a Device > Scan QR Code</p>
        </div>

        <!-- Pairing Code Display -->
        <div v-else-if="pairingCode" class="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <p class="text-sm text-gray-600 mb-2">Enter this code in WhatsApp:</p>
          <p class="text-2xl font-mono font-bold text-green-700">{{ pairingCode }}</p>
          <p class="text-xs text-gray-500 mt-2">WhatsApp > Linked Devices > Link a Device</p>
        </div>

        <!-- Connection Options -->
        <div class="space-y-4">
          <!-- QR Code Method -->
          <div>
            <button
              @click="connectWhatsAppQR"
              :disabled="connectingQR || connecting"
              class="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ connectingQR ? 'Generating QR Code...' : 'Connect with QR Code (Recommended)' }}
            </button>
          </div>

          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-300"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-white text-gray-500">or use pairing code</span>
            </div>
          </div>

          <!-- Pairing Code Method -->
          <form @submit.prevent="connectWhatsApp" class="flex gap-4">
            <input
              v-model="phoneNumber"
              type="text"
              placeholder="Phone number (e.g., 33612345678)"
              class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              :disabled="connecting || connectingQR"
            />
            <button
              type="submit"
              :disabled="connecting || connectingQR || !phoneNumber"
              class="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ connecting ? 'Connecting...' : 'Connect' }}
            </button>
          </form>
        </div>
      </div>

      <!-- Recent Activity -->
      <div v-if="serviceStatus && serviceStatus.recentNotifications.length > 0" class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold mb-4">Recent Notifications</h3>
        <div class="space-y-2">
          <div
            v-for="(notification, index) in serviceStatus.recentNotifications"
            :key="index"
            class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
          >
            <div class="flex items-center">
              <span class="text-lg mr-3">{{ notification.type === 'movies' ? '🎬' : '📺' }}</span>
              <div>
                <span class="font-medium capitalize">{{ notification.type }}</span>
                <span class="text-gray-500 text-sm ml-2">{{ notification.count }} item{{ notification.count > 1 ? 's' : '' }}</span>
              </div>
            </div>
            <div class="flex items-center">
              <span
                class="px-2 py-1 rounded text-xs mr-3"
                :class="notification.success ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'"
              >
                {{ notification.success ? 'Sent' : 'Queued' }}
              </span>
              <span class="text-sm text-gray-500">{{ formatTimeAgo(notification.timestamp) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Pending Messages -->
      <div v-if="queueStatus && queueStatus.messages.length > 0" class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold mb-4">Pending Messages</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Retries</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Content</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="msg in queueStatus.messages.slice(0, 10)" :key="msg.id">
                <td class="px-4 py-2 text-sm">{{ msg.id }}</td>
                <td class="px-4 py-2 text-sm">{{ msg.mediaType }}</td>
                <td class="px-4 py-2 text-sm">
                  <span
                    class="px-2 py-1 rounded text-xs"
                    :class="{
                      'bg-yellow-100 text-yellow-800': msg.status === 'pending',
                      'bg-green-100 text-green-800': msg.status === 'sent',
                      'bg-red-100 text-red-800': msg.status === 'failed',
                    }"
                  >
                    {{ msg.status }}
                  </span>
                </td>
                <td class="px-4 py-2 text-sm">{{ msg.retryCount }}</td>
                <td class="px-4 py-2 text-sm truncate max-w-xs">{{ msg.content.substring(0, 50) }}...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
