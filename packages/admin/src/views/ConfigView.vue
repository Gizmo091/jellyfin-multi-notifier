<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import {
  apiClient,
  type ConfigStatus,
  type AlertTestResult,
  type WhatsAppGroupsResponse,
} from '../api/client'

const loading = ref(true)
const error = ref<string | null>(null)
const config = ref<ConfigStatus | null>(null)
const testingAlerts = ref(false)
const testResults = ref<AlertTestResult[]>([])

// Group selector state
const loadingGroups = ref(false)
const groupsError = ref<string | null>(null)
const groups = ref<WhatsAppGroupsResponse | null>(null)
const selectedGroupId = ref<string | null>(null)
const savingGroup = ref(false)
const saveSuccess = ref(false)

// WhatsApp status
const whatsappConnected = ref(false)

async function loadConfig() {
  try {
    const response = await apiClient.getConfig()
    if (response.success) {
      config.value = response.data
      selectedGroupId.value = response.data.whatsappGroupId
    } else {
      error.value = response.error
    }
  } catch {
    error.value = 'Failed to load configuration'
  } finally {
    loading.value = false
  }
}

async function loadWhatsAppStatus() {
  const response = await apiClient.getWhatsAppStatus()
  if (response.success) {
    whatsappConnected.value = response.data.connected
    if (response.data.connected) {
      loadGroups()
    }
  }
}

async function loadGroups() {
  loadingGroups.value = true
  groupsError.value = null

  const response = await apiClient.getWhatsAppGroups()

  loadingGroups.value = false

  if (response.success) {
    groups.value = response.data
  } else {
    groupsError.value = response.error
  }
}

async function saveGroup() {
  if (!selectedGroupId.value) return

  savingGroup.value = true
  saveSuccess.value = false

  const response = await apiClient.setWhatsAppGroup(selectedGroupId.value)

  savingGroup.value = false

  if (response.success) {
    saveSuccess.value = true
    // Reload config to reflect the change
    await loadConfig()
    setTimeout(() => {
      saveSuccess.value = false
    }, 3000)
  } else {
    error.value = response.error
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

// Flatten groups for the dropdown
const flatGroupOptions = computed(() => {
  if (!groups.value) return []

  const options: Array<{
    id: string
    name: string
    image?: string
    isHeader?: boolean
    indent?: boolean
    participantCount?: number
  }> = []

  // Add communities and their groups
  for (const community of groups.value.communities) {
    if (community.groups.length > 0) {
      // Add community as header
      options.push({
        id: `header-${community.id}`,
        name: community.name,
        image: community.image,
        isHeader: true,
      })
      // Add groups under community
      for (const group of community.groups) {
        options.push({
          id: group.id,
          name: group.name,
          image: group.image,
          indent: true,
          participantCount: group.participantCount,
        })
      }
    }
  }

  // Add standalone groups
  if (groups.value.standaloneGroups.length > 0) {
    if (options.length > 0) {
      options.push({
        id: 'header-standalone',
        name: 'Other Groups',
        isHeader: true,
      })
    }
    for (const group of groups.value.standaloneGroups) {
      options.push({
        id: group.id,
        name: group.name,
        image: group.image,
        participantCount: group.participantCount,
      })
    }
  }

  return options
})

// Find selected group name
const selectedGroupName = computed(() => {
  if (!selectedGroupId.value || !groups.value) return null

  // Search in communities
  for (const community of groups.value.communities) {
    for (const group of community.groups) {
      if (group.id === selectedGroupId.value) {
        return group.name
      }
    }
  }

  // Search in standalone
  for (const group of groups.value.standaloneGroups) {
    if (group.id === selectedGroupId.value) {
      return group.name
    }
  }

  return null
})

onMounted(() => {
  loadConfig()
  loadWhatsAppStatus()
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
      <!-- WhatsApp Group Selector -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold mb-4">WhatsApp Target Group</h3>

        <div v-if="!whatsappConnected" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div class="flex items-center">
            <span class="text-yellow-600 text-xl mr-3">!</span>
            <div>
              <p class="font-medium text-yellow-800">WhatsApp not connected</p>
              <p class="text-sm text-yellow-700">Connect WhatsApp from the Dashboard to select a target group.</p>
            </div>
          </div>
        </div>

        <div v-else>
          <div v-if="loadingGroups" class="text-gray-500">Loading groups...</div>

          <div v-else-if="groupsError" class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {{ groupsError }}
          </div>

          <div v-else-if="groups">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-2">Select Target Group</label>
                <select
                  v-model="selectedGroupId"
                  class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option :value="null">-- Select a group --</option>
                  <template v-for="option in flatGroupOptions" :key="option.id">
                    <option v-if="option.isHeader" disabled class="font-bold bg-gray-100">
                      {{ option.name }}
                    </option>
                    <option v-else :value="option.id">
                      {{ option.indent ? '  ' : '' }}{{ option.name }}
                      {{ option.participantCount ? `(${option.participantCount} members)` : '' }}
                    </option>
                  </template>
                </select>
              </div>

              <!-- Preview selected group -->
              <div v-if="selectedGroupId && selectedGroupName" class="flex items-center space-x-3 bg-gray-50 rounded-lg p-3">
                <div class="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                  <img
                    v-if="flatGroupOptions.find(g => g.id === selectedGroupId)?.image"
                    :src="flatGroupOptions.find(g => g.id === selectedGroupId)?.image"
                    class="w-10 h-10 object-cover"
                    alt=""
                  />
                  <span v-else class="text-gray-400 text-lg">G</span>
                </div>
                <div>
                  <p class="font-medium text-gray-900">{{ selectedGroupName }}</p>
                  <p class="text-xs text-gray-500 font-mono">{{ selectedGroupId }}</p>
                </div>
              </div>

              <!-- Save button -->
              <div class="flex items-center space-x-4">
                <button
                  @click="saveGroup"
                  :disabled="savingGroup || !selectedGroupId || selectedGroupId === config.whatsappGroupId"
                  class="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {{ savingGroup ? 'Saving...' : 'Save' }}
                </button>
                <span v-if="saveSuccess" class="text-green-600 text-sm">Saved successfully!</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Current configuration -->
        <div v-if="config.whatsappGroupId" class="mt-4 pt-4 border-t border-gray-200">
          <p class="text-sm text-gray-600">
            <span class="font-medium">Current target:</span>
            <span class="font-mono text-xs ml-2">{{ config.whatsappGroupId }}</span>
          </p>
        </div>
        <div v-else class="mt-4 pt-4 border-t border-gray-200">
          <p class="text-sm text-yellow-600">No target group configured yet.</p>
        </div>
      </div>

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
              <span class="text-xl mr-3">E</span>
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
              <span class="text-xl mr-3">T</span>
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
              <span class="text-xl mr-3">D</span>
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
                <td class="px-4 py-2 font-mono text-xs">WHATSAPP_PHONE_NUMBER</td>
                <td class="px-4 py-2 text-gray-600">Phone number for auto-connect at startup (international format without +)</td>
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
