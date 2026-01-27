<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiClient, type ConfigStatus, type AlertTestResult } from '../api/client'

const loading = ref(true)
const error = ref<string | null>(null)
const config = ref<ConfigStatus | null>(null)
const testingAlerts = ref(false)
const testResults = ref<AlertTestResult[]>([])

async function loadConfig() {
  try {
    const response = await apiClient.getConfig()
    if (response.success) {
      config.value = response.data
    } else {
      error.value = response.error
    }
  } catch {
    error.value = 'Failed to load configuration'
  } finally {
    loading.value = false
  }
}

async function testAlerts() {
  testingAlerts.value = true
  testResults.value = []

  const response = await apiClient.testAlerts()

  testingAlerts.value = false

  if (response.success) {
    testResults.value = response.data.results
  } else {
    error.value = response.error
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">Configuration</h2>

    <div v-if="loading" class="text-gray-500">Loading...</div>

    <div v-else-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
      {{ error }}
    </div>

    <div v-else-if="config" class="space-y-6">
      <!-- Core Configuration -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold mb-4">Core Settings</h3>
        <div class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-600">Jellyfin URL</label>
              <p class="mt-1 text-gray-900 font-mono text-sm bg-gray-50 px-3 py-2 rounded">
                {{ config.jellyfinUrl }}
              </p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600">Public URL</label>
              <p class="mt-1 text-gray-900 font-mono text-sm bg-gray-50 px-3 py-2 rounded">
                {{ config.publicUrl }}
              </p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600">WhatsApp Group ID</label>
              <p class="mt-1 text-gray-900 font-mono text-sm bg-gray-50 px-3 py-2 rounded">
                {{ config.whatsappGroupId }}
              </p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600">Aggregation Window</label>
              <p class="mt-1 text-gray-900 font-mono text-sm bg-gray-50 px-3 py-2 rounded">
                {{ config.aggregationWindowMinutes }} minutes
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Alert Channels -->
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">Alert Channels</h3>
          <button
            @click="testAlerts"
            :disabled="testingAlerts"
            class="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {{ testingAlerts ? 'Sending...' : 'Send Test Alert' }}
          </button>
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between py-2 border-b border-gray-100">
            <div class="flex items-center">
              <span class="text-xl mr-3">📧</span>
              <span class="font-medium">Email (SMTP)</span>
            </div>
            <span
              class="px-3 py-1 rounded-full text-sm"
              :class="config.alerts.emailConfigured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
            >
              {{ config.alerts.emailConfigured ? 'Configured' : 'Not configured' }}
            </span>
          </div>

          <div class="flex items-center justify-between py-2 border-b border-gray-100">
            <div class="flex items-center">
              <span class="text-xl mr-3">💬</span>
              <span class="font-medium">Telegram</span>
            </div>
            <span
              class="px-3 py-1 rounded-full text-sm"
              :class="config.alerts.telegramConfigured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
            >
              {{ config.alerts.telegramConfigured ? 'Configured' : 'Not configured' }}
            </span>
          </div>

          <div class="flex items-center justify-between py-2">
            <div class="flex items-center">
              <span class="text-xl mr-3">🎮</span>
              <span class="font-medium">Discord</span>
            </div>
            <span
              class="px-3 py-1 rounded-full text-sm"
              :class="config.alerts.discordConfigured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
            >
              {{ config.alerts.discordConfigured ? 'Configured' : 'Not configured' }}
            </span>
          </div>
        </div>

        <!-- Test Results -->
        <div v-if="testResults.length > 0" class="mt-4 pt-4 border-t border-gray-200">
          <h4 class="text-sm font-semibold text-gray-600 mb-2">Test Results</h4>
          <div class="space-y-2">
            <div
              v-for="result in testResults"
              :key="result.channel"
              class="flex items-center justify-between text-sm"
            >
              <span class="capitalize">{{ result.channel }}</span>
              <span
                class="px-2 py-1 rounded text-xs"
                :class="result.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
              >
                {{ result.success ? 'Sent' : result.error || 'Failed' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Environment Variables Reference -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold mb-4">Environment Variables Reference</h3>
        <p class="text-sm text-gray-600 mb-4">
          Configuration is managed via environment variables. Update your docker-compose.yml or .env file to change these settings.
        </p>
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-2 text-left font-medium text-gray-600">Variable</th>
                <th class="px-4 py-2 text-left font-medium text-gray-600">Description</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr>
                <td class="px-4 py-2 font-mono text-xs">JELLYFIN_URL</td>
                <td class="px-4 py-2 text-gray-600">Jellyfin server URL for redirects</td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono text-xs">WHATSAPP_GROUP_ID</td>
                <td class="px-4 py-2 text-gray-600">Target WhatsApp group ID</td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono text-xs">AGGREGATION_WINDOW_MINUTES</td>
                <td class="px-4 py-2 text-gray-600">Time window for batching notifications (default: 15)</td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono text-xs">PUBLIC_URL</td>
                <td class="px-4 py-2 text-gray-600">Public URL for redirect links</td>
              </tr>
              <tr class="bg-gray-50">
                <td class="px-4 py-2 font-mono text-xs" colspan="2">
                  <strong>Email Alerts</strong>
                </td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono text-xs">SMTP_HOST</td>
                <td class="px-4 py-2 text-gray-600">SMTP server hostname</td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono text-xs">SMTP_PORT</td>
                <td class="px-4 py-2 text-gray-600">SMTP server port (default: 587)</td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono text-xs">SMTP_USER</td>
                <td class="px-4 py-2 text-gray-600">SMTP username</td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono text-xs">SMTP_PASS</td>
                <td class="px-4 py-2 text-gray-600">SMTP password</td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono text-xs">ALERT_EMAIL</td>
                <td class="px-4 py-2 text-gray-600">Email address to receive alerts</td>
              </tr>
              <tr class="bg-gray-50">
                <td class="px-4 py-2 font-mono text-xs" colspan="2">
                  <strong>Telegram Alerts</strong>
                </td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono text-xs">TELEGRAM_BOT_TOKEN</td>
                <td class="px-4 py-2 text-gray-600">Telegram bot token from @BotFather</td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono text-xs">TELEGRAM_CHAT_ID</td>
                <td class="px-4 py-2 text-gray-600">Telegram chat ID for alerts</td>
              </tr>
              <tr class="bg-gray-50">
                <td class="px-4 py-2 font-mono text-xs" colspan="2">
                  <strong>Discord Alerts</strong>
                </td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono text-xs">DISCORD_WEBHOOK_URL</td>
                <td class="px-4 py-2 text-gray-600">Discord webhook URL</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
