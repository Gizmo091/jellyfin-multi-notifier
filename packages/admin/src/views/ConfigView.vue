<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import {
  apiClient,
  type ConfigStatus,
  type AlertTestResult,
  type WhatsAppGroupsResponse,
  type WebhookConfig,
  type TestWebhookResult,
  type SupportedLanguage,
  type ChannelType,
  type NotificationChannel,
} from '../api/client'

const loading = ref(true)
const error = ref<string | null>(null)
const config = ref<ConfigStatus | null>(null)
const testingAlerts = ref(false)
const testResults = ref<AlertTestResult[]>([])

// Webhook config state
const webhookConfig = ref<WebhookConfig | null>(null)
const copiedField = ref<string | null>(null)

// Test webhook state
const testingWebhook = ref(false)
const testWebhookType = ref<'movie' | 'series'>('movie')
const testWebhookResult = ref<TestWebhookResult | null>(null)

// Group selector state (for WhatsApp)
const loadingGroups = ref(false)
const groupsError = ref<string | null>(null)
const groups = ref<WhatsAppGroupsResponse | null>(null)
const groupsCachedAt = ref<string | null>(null)

// Multi-channel configuration state
const newChannelType = ref<ChannelType>('whatsapp')
const newChannelTarget = ref('')
const newChannelName = ref('')
const newChannelLanguage = ref<SupportedLanguage>('fr')
const newChannelTelegramToken = ref('')
const addingChannel = ref(false)
const removingChannelId = ref<string | null>(null)
const togglingChannelId = ref<string | null>(null)
const testingChannelId = ref<string | null>(null)
const testChannelResult = ref<{ channelId: string; success: boolean; error?: string } | null>(null)
const editingChannelId = ref<string | null>(null)
const editingChannelName = ref('')
const testingNewChannel = ref(false)
const testNewChannelResult = ref<{ success: boolean; error?: string } | null>(null)

// Group selector for WhatsApp channel type
const selectedGroupId = ref<string | null>(null)

// WhatsApp status
const whatsappConnected = ref(false)

async function loadConfig() {
  try {
    const [configResponse, webhookResponse] = await Promise.all([
      apiClient.getConfig(),
      apiClient.getWebhookConfig(),
    ])

    if (configResponse.success) {
      config.value = configResponse.data
      selectedGroupId.value = configResponse.data.whatsappGroupId
    } else {
      error.value = configResponse.error
    }

    if (webhookResponse.success) {
      webhookConfig.value = webhookResponse.data
    }
  } catch {
    error.value = 'Failed to load configuration'
  } finally {
    loading.value = false
  }
}

async function copyToClipboard(text: string, fieldName: string) {
  try {
    await navigator.clipboard.writeText(text)
    copiedField.value = fieldName
    setTimeout(() => {
      copiedField.value = null
    }, 2000)
  } catch {
    error.value = 'Failed to copy to clipboard'
  }
}

async function testWebhook() {
  testingWebhook.value = true
  testWebhookResult.value = null
  error.value = null

  const response = await apiClient.testWebhook(testWebhookType.value, { flushImmediately: true })

  testingWebhook.value = false

  if (response.success) {
    testWebhookResult.value = response.data
  } else {
    error.value = response.error
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

async function loadGroups(refresh = false) {
  loadingGroups.value = true
  groupsError.value = null

  const response = await apiClient.getWhatsAppGroups(refresh)

  loadingGroups.value = false

  if (response.success) {
    groups.value = response.data
    groupsCachedAt.value = response.data.cachedAt || null
  } else {
    groupsError.value = response.error
  }
}

async function refreshGroups() {
  await loadGroups(true)
}

function formatCacheDate(isoDate: string): string {
  const date = new Date(isoDate)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
}

function findGroupName(groupId: string): string | null {
  if (!groups.value) return null

  // Search in communities
  for (const community of groups.value.communities) {
    for (const group of community.groups) {
      if (group.id === groupId) {
        return group.name
      }
    }
  }

  // Search in standalone
  for (const group of groups.value.standaloneGroups) {
    if (group.id === groupId) {
      return group.name
    }
  }

  return null
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

// Notification Channel functions
async function testNewChannelConfig() {
  if (!newChannelTarget.value) return
  if (newChannelType.value === 'telegram' && !newChannelTelegramToken.value) return

  testingNewChannel.value = true
  testNewChannelResult.value = null
  error.value = null

  const channelConfig = newChannelType.value === 'telegram' && newChannelTelegramToken.value
    ? { telegramBotToken: newChannelTelegramToken.value }
    : undefined

  const response = await apiClient.testNotificationChannelConfig({
    channelType: newChannelType.value,
    target: newChannelTarget.value,
    language: newChannelLanguage.value,
    config: channelConfig,
  })

  testingNewChannel.value = false

  if (response.success) {
    testNewChannelResult.value = response.data
    // Clear result after 10 seconds
    setTimeout(() => {
      testNewChannelResult.value = null
    }, 10000)
  } else {
    error.value = response.error
  }
}

async function addChannel() {
  if (!newChannelTarget.value || !newChannelName.value) return

  addingChannel.value = true
  error.value = null

  const channelConfig = newChannelType.value === 'telegram' && newChannelTelegramToken.value
    ? { telegramBotToken: newChannelTelegramToken.value }
    : undefined

  const response = await apiClient.addNotificationChannel({
    channelType: newChannelType.value,
    target: newChannelTarget.value,
    displayName: newChannelName.value,
    language: newChannelLanguage.value,
    config: channelConfig,
  })

  addingChannel.value = false

  if (response.success) {
    await loadConfig()
    // Reset form
    newChannelTarget.value = ''
    newChannelName.value = ''
    newChannelLanguage.value = 'fr'
    newChannelTelegramToken.value = ''
    testNewChannelResult.value = null
  } else {
    error.value = response.error
  }
}

async function removeChannel(id: string) {
  removingChannelId.value = id
  error.value = null

  const response = await apiClient.removeNotificationChannel(id)

  removingChannelId.value = null

  if (response.success) {
    await loadConfig()
  } else {
    error.value = response.error
  }
}

async function toggleChannel(channel: NotificationChannel) {
  togglingChannelId.value = channel.id
  error.value = null

  const response = await apiClient.toggleNotificationChannel(channel.id, !channel.enabled)

  togglingChannelId.value = null

  if (response.success) {
    await loadConfig()
  } else {
    error.value = response.error
  }
}

async function testChannel(id: string) {
  testingChannelId.value = id
  testChannelResult.value = null
  error.value = null

  const response = await apiClient.testNotificationChannel(id)

  testingChannelId.value = null

  if (response.success) {
    testChannelResult.value = { channelId: id, ...response.data }
    // Clear result after 5 seconds
    setTimeout(() => {
      if (testChannelResult.value?.channelId === id) {
        testChannelResult.value = null
      }
    }, 5000)
  } else {
    error.value = response.error
  }
}

function startEditingChannel(channel: NotificationChannel) {
  editingChannelId.value = channel.id
  editingChannelName.value = channel.displayName
}

function cancelEditingChannel() {
  editingChannelId.value = null
  editingChannelName.value = ''
}

async function saveChannelName(channelId: string) {
  if (!editingChannelName.value.trim()) return

  error.value = null

  const response = await apiClient.updateNotificationChannel(channelId, {
    displayName: editingChannelName.value.trim(),
  })

  if (response.success) {
    await loadConfig()
    editingChannelId.value = null
    editingChannelName.value = ''
  } else {
    error.value = response.error
  }
}

function getChannelIcon(type: ChannelType): string {
  switch (type) {
    case 'whatsapp': return 'W'
    case 'discord': return 'D'
    case 'telegram': return 'T'
    default: return '?'
  }
}

function getChannelColor(type: ChannelType): string {
  switch (type) {
    case 'whatsapp': return 'bg-green-100 text-green-700'
    case 'discord': return 'bg-indigo-100 text-indigo-700'
    case 'telegram': return 'bg-blue-100 text-blue-700'
    default: return 'bg-gray-100 text-gray-700'
  }
}

// When WhatsApp group is selected, fill in the name
function onWhatsAppGroupSelected() {
  if (selectedGroupId.value && newChannelType.value === 'whatsapp') {
    const groupName = findGroupName(selectedGroupId.value)
    if (groupName) {
      newChannelName.value = groupName
      newChannelTarget.value = selectedGroupId.value
    }
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
      <!-- Jellyfin Webhook Setup -->
      <div v-if="webhookConfig" class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold mb-4">Jellyfin Webhook Setup</h3>
        <p class="text-sm text-gray-600 mb-4">
          Configure the Jellyfin Webhook plugin with these settings. Install the plugin from the Jellyfin catalog first.
        </p>

        <div class="space-y-4">
          <!-- Webhook URL -->
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Webhook URL</label>
            <div class="flex items-center gap-2">
              <code class="flex-1 bg-gray-50 px-3 py-2 rounded text-sm font-mono border border-gray-200 overflow-x-auto">
                {{ webhookConfig.webhookUrl }}
              </code>
              <button
                @click="copyToClipboard(webhookConfig.webhookUrl, 'url')"
                class="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm transition-colors"
              >
                {{ copiedField === 'url' ? 'Copied!' : 'Copy' }}
              </button>
            </div>
          </div>

          <!-- Webhook Secret Header -->
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Request Header</label>
            <div v-if="webhookConfig.secretConfigured" class="space-y-2">
              <p class="text-xs text-gray-500">Add this header in the "Add Request Header" section:</p>
              <div class="flex items-center gap-2">
                <code class="flex-1 bg-gray-50 px-3 py-2 rounded text-sm font-mono border border-gray-200">
                  X-Webhook-Secret: {{ webhookConfig.webhookSecret }}
                </code>
                <button
                  @click="copyToClipboard(`X-Webhook-Secret: ${webhookConfig.webhookSecret}`, 'secret')"
                  class="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm transition-colors"
                >
                  {{ copiedField === 'secret' ? 'Copied!' : 'Copy' }}
                </button>
              </div>
            </div>
            <div v-else class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p class="text-sm text-yellow-700">
                <strong>Warning:</strong> No WEBHOOK_SECRET configured. Add one to your .env file for security.
              </p>
            </div>
          </div>

          <!-- Notification Types -->
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Notification Types to Enable</label>
            <div class="bg-gray-50 px-3 py-2 rounded border border-gray-200">
              <span
                v-for="type in webhookConfig.notificationTypes"
                :key="type"
                class="inline-block bg-primary-100 text-primary-700 px-2 py-1 rounded text-sm mr-2"
              >
                {{ type }}
              </span>
            </div>
            <p class="text-xs text-gray-500 mt-1">Check only these notification types in the Jellyfin plugin settings.</p>
          </div>

          <!-- Template -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-sm font-medium text-gray-600">Handlebars Template</label>
              <button
                @click="copyToClipboard(webhookConfig.template, 'template')"
                class="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm transition-colors"
              >
                {{ copiedField === 'template' ? 'Copied!' : 'Copy Template' }}
              </button>
            </div>
            <pre class="bg-gray-900 text-green-400 px-4 py-3 rounded text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto">{{ webhookConfig.template }}</pre>
            <p class="text-xs text-gray-500 mt-1">Paste this in the "Template" field of the webhook configuration.</p>
          </div>

          <!-- Setup Instructions -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
            <h4 class="font-medium text-blue-800 mb-2">Setup Instructions</h4>
            <ol class="text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li>Install the "Webhook" plugin from Jellyfin's plugin catalog</li>
              <li>Go to Dashboard > Plugins > Webhook > Settings</li>
              <li>Click "Add Generic Destination"</li>
              <li>Paste the Webhook URL above</li>
              <li>Add the request header (X-Webhook-Secret)</li>
              <li>Select only "Item Added" notification type</li>
              <li>Paste the template above in the Template field</li>
              <li>Save and test with a new media item</li>
            </ol>
          </div>

          <!-- Test Webhook -->
          <div class="border-t border-gray-200 pt-4 mt-4">
            <h4 class="font-medium text-gray-800 mb-3">Test Notification</h4>
            <p class="text-sm text-gray-600 mb-3">
              Simulate a webhook to test the full notification flow (adds to aggregation and sends to WhatsApp).
            </p>
            <div class="flex items-center gap-4">
              <select
                v-model="testWebhookType"
                class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                :disabled="testingWebhook"
              >
                <option value="movie">Movie</option>
                <option value="series">Series</option>
              </select>
              <button
                @click="testWebhook"
                :disabled="testingWebhook"
                class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {{ testingWebhook ? 'Sending...' : 'Send Test Notification' }}
              </button>
            </div>
            <div v-if="testWebhookResult" class="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
              <p class="text-sm text-green-700">
                <strong>Test sent!</strong> "{{ testWebhookResult.event.title }}" added to {{ testWebhookResult.event.type }} queue
                <span v-if="testWebhookResult.flushed">(flushed immediately)</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Notification Channels Configuration -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold mb-2">Notification Channels</h3>
        <p class="text-sm text-gray-600 mb-4">
          Configure multiple notification channels (WhatsApp, Discord, Telegram) with different languages.
        </p>

        <!-- Configured Channels List -->
        <div v-if="config.notificationChannels && config.notificationChannels.length > 0" class="mb-6">
          <h4 class="text-sm font-medium text-gray-700 mb-3">Configured Channels</h4>
          <div class="space-y-3">
            <div
              v-for="channel in config.notificationChannels"
              :key="channel.id"
              class="bg-gray-50 rounded-lg p-4"
              :class="{ 'opacity-50': !channel.enabled }"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <div
                    class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    :class="getChannelColor(channel.channelType)"
                  >
                    <span class="font-bold text-sm">{{ getChannelIcon(channel.channelType) }}</span>
                  </div>
                  <div>
                    <!-- Edit mode -->
                    <div v-if="editingChannelId === channel.id" class="flex items-center space-x-2">
                      <input
                        v-model="editingChannelName"
                        type="text"
                        class="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        @keyup.enter="saveChannelName(channel.id)"
                        @keyup.escape="cancelEditingChannel"
                      />
                      <button
                        @click="saveChannelName(channel.id)"
                        class="text-green-600 hover:text-green-800 px-2 py-1 rounded hover:bg-green-50 text-sm"
                      >
                        Save
                      </button>
                      <button
                        @click="cancelEditingChannel"
                        class="text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                    <!-- Display mode -->
                    <div v-else>
                      <p class="font-medium text-gray-900 flex items-center">
                        {{ channel.displayName }}
                        <button
                          @click="startEditingChannel(channel)"
                          class="ml-2 text-gray-400 hover:text-gray-600"
                          title="Rename"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <span v-if="!channel.enabled" class="text-xs text-gray-500 ml-2">(disabled)</span>
                      </p>
                      <p class="text-xs text-gray-500">
                        {{ channel.channelType.charAt(0).toUpperCase() + channel.channelType.slice(1) }} &middot;
                        {{ config.supportedLanguages.find(l => l.code === channel.language)?.name || channel.language }}
                      </p>
                    </div>
                  </div>
                </div>
                <div class="flex items-center space-x-2">
                  <!-- Test result indicator -->
                  <span
                    v-if="testChannelResult?.channelId === channel.id"
                    class="text-xs px-2 py-1 rounded"
                    :class="testChannelResult.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
                  >
                    {{ testChannelResult.success ? 'Test sent!' : testChannelResult.error }}
                  </span>
                  <!-- Test button -->
                  <button
                    @click="testChannel(channel.id)"
                    :disabled="testingChannelId === channel.id"
                    class="text-primary-600 hover:text-primary-800 hover:bg-primary-50 px-2 py-1 rounded transition-colors text-sm"
                  >
                    {{ testingChannelId === channel.id ? 'Testing...' : 'Test' }}
                  </button>
                  <!-- Toggle button -->
                  <button
                    @click="toggleChannel(channel)"
                    :disabled="togglingChannelId === channel.id"
                    class="text-gray-600 hover:text-gray-800 hover:bg-gray-100 px-2 py-1 rounded transition-colors text-sm"
                  >
                    {{ togglingChannelId === channel.id ? '...' : (channel.enabled ? 'Disable' : 'Enable') }}
                  </button>
                  <!-- Remove button -->
                  <button
                    @click="removeChannel(channel.id)"
                    :disabled="removingChannelId === channel.id"
                    class="text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded transition-colors text-sm"
                  >
                    {{ removingChannelId === channel.id ? '...' : 'Remove' }}
                  </button>
                </div>
              </div>

              <!-- Channel configuration details -->
              <div class="mt-3 pt-3 border-t border-gray-200 text-xs space-y-1">
                <!-- Discord: Webhook URL -->
                <div v-if="channel.channelType === 'discord'" class="flex items-center gap-2">
                  <span class="text-gray-500 font-medium w-24">Webhook URL:</span>
                  <code class="flex-1 bg-white px-2 py-1 rounded border border-gray-200 text-gray-700 truncate" :title="channel.target">
                    {{ channel.target }}
                  </code>
                  <button
                    @click="copyToClipboard(channel.target, `target-${channel.id}`)"
                    class="text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                  >
                    {{ copiedField === `target-${channel.id}` ? 'Copied!' : 'Copy' }}
                  </button>
                </div>

                <!-- Telegram: Chat ID and Bot Token -->
                <template v-if="channel.channelType === 'telegram'">
                  <div class="flex items-center gap-2">
                    <span class="text-gray-500 font-medium w-24">Chat ID:</span>
                    <code class="flex-1 bg-white px-2 py-1 rounded border border-gray-200 text-gray-700 truncate" :title="channel.target">
                      {{ channel.target }}
                    </code>
                    <button
                      @click="copyToClipboard(channel.target, `target-${channel.id}`)"
                      class="text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                    >
                      {{ copiedField === `target-${channel.id}` ? 'Copied!' : 'Copy' }}
                    </button>
                  </div>
                  <div v-if="channel.config?.telegramBotToken" class="flex items-center gap-2">
                    <span class="text-gray-500 font-medium w-24">Bot Token:</span>
                    <code class="flex-1 bg-white px-2 py-1 rounded border border-gray-200 text-gray-700 truncate">
                      {{ channel.config.telegramBotToken.substring(0, 10) }}...{{ channel.config.telegramBotToken.substring(channel.config.telegramBotToken.length - 5) }}
                    </code>
                    <button
                      @click="copyToClipboard(channel.config.telegramBotToken, `token-${channel.id}`)"
                      class="text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                    >
                      {{ copiedField === `token-${channel.id}` ? 'Copied!' : 'Copy' }}
                    </button>
                  </div>
                </template>

                <!-- WhatsApp: Group ID -->
                <div v-if="channel.channelType === 'whatsapp'" class="flex items-center gap-2">
                  <span class="text-gray-500 font-medium w-24">Group ID:</span>
                  <code class="flex-1 bg-white px-2 py-1 rounded border border-gray-200 text-gray-700 truncate" :title="channel.target">
                    {{ channel.target }}
                  </code>
                  <button
                    @click="copyToClipboard(channel.target, `target-${channel.id}`)"
                    class="text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                  >
                    {{ copiedField === `target-${channel.id}` ? 'Copied!' : 'Copy' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p class="text-sm text-yellow-700">No channels configured yet. Add a channel below to start receiving notifications.</p>
        </div>

        <!-- Add New Channel -->
        <div class="border-t border-gray-200 pt-4">
          <h4 class="text-sm font-medium text-gray-700 mb-3">Add New Channel</h4>

          <div class="space-y-4">
            <!-- Channel Type Selector -->
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-2">Channel Type</label>
              <div class="flex space-x-4">
                <label class="flex items-center">
                  <input
                    type="radio"
                    v-model="newChannelType"
                    value="whatsapp"
                    class="mr-2"
                  />
                  <span class="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold mr-1">W</span>
                  WhatsApp
                </label>
                <label class="flex items-center">
                  <input
                    type="radio"
                    v-model="newChannelType"
                    value="discord"
                    class="mr-2"
                  />
                  <span class="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold mr-1">D</span>
                  Discord
                </label>
                <label class="flex items-center">
                  <input
                    type="radio"
                    v-model="newChannelType"
                    value="telegram"
                    class="mr-2"
                  />
                  <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold mr-1">T</span>
                  Telegram
                </label>
              </div>
            </div>

            <!-- WhatsApp-specific: Group Selector -->
            <div v-if="newChannelType === 'whatsapp'">
              <div v-if="!whatsappConnected" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div class="flex items-center">
                  <span class="text-yellow-600 text-xl mr-3">!</span>
                  <div>
                    <p class="font-medium text-yellow-800">WhatsApp not connected</p>
                    <p class="text-sm text-yellow-700">Connect WhatsApp from the Dashboard to add WhatsApp channels.</p>
                  </div>
                </div>
              </div>

              <div v-else>
                <div v-if="loadingGroups" class="text-gray-500 py-2">
                  Loading available groups...
                </div>

                <div v-else-if="groupsError" class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                  {{ groupsError }}
                </div>

                <div v-else-if="groups">
                  <div class="flex items-center justify-between mb-2">
                    <label class="text-sm font-medium text-gray-600">WhatsApp Group</label>
                    <div class="flex items-center gap-2">
                      <span v-if="groupsCachedAt" class="text-xs text-gray-400">
                        Cache: {{ formatCacheDate(groupsCachedAt) }}
                      </span>
                      <button
                        @click="refreshGroups"
                        :disabled="loadingGroups"
                        class="text-xs text-primary-600 hover:text-primary-800 hover:underline disabled:opacity-50"
                      >
                        {{ loadingGroups ? 'Refreshing...' : 'Refresh' }}
                      </button>
                    </div>
                  </div>
                  <select
                    v-model="selectedGroupId"
                    @change="onWhatsAppGroupSelected"
                    class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    :disabled="addingChannel"
                  >
                    <option :value="null">-- Select a group --</option>
                    <template v-for="option in flatGroupOptions" :key="option.id">
                      <option v-if="option.isHeader" disabled class="font-bold bg-gray-100">
                        {{ option.name }}
                      </option>
                      <option
                        v-else
                        :value="option.id"
                        :disabled="config.notificationChannels?.some(c => c.channelType === 'whatsapp' && c.target === option.id)"
                      >
                        {{ option.indent ? '  ' : '' }}{{ option.name }}
                        {{ option.participantCount ? `(${option.participantCount})` : '' }}
                        {{ config.notificationChannels?.some(c => c.channelType === 'whatsapp' && c.target === option.id) ? '(already added)' : '' }}
                      </option>
                    </template>
                  </select>
                </div>
              </div>
            </div>

            <!-- Discord-specific: Webhook URL -->
            <div v-if="newChannelType === 'discord'">
              <label class="block text-sm font-medium text-gray-600 mb-2">Discord Webhook URL</label>
              <input
                v-model="newChannelTarget"
                type="text"
                placeholder="https://discord.com/api/webhooks/..."
                class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                :disabled="addingChannel"
              />
              <p class="text-xs text-gray-500 mt-1">
                Create a webhook in Discord: Server Settings &gt; Integrations &gt; Webhooks &gt; New Webhook
              </p>
            </div>

            <!-- Telegram-specific: Chat ID and Bot Token -->
            <div v-if="newChannelType === 'telegram'" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-2">Telegram Chat ID</label>
                <input
                  v-model="newChannelTarget"
                  type="text"
                  placeholder="e.g., -1001234567890 or @channelname"
                  class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  :disabled="addingChannel"
                />
                <p class="text-xs text-gray-500 mt-1">
                  Use @userinfobot to find your chat ID, or use the channel username prefixed with @
                </p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-2">Bot Token</label>
                <input
                  v-model="newChannelTelegramToken"
                  type="password"
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                  class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  :disabled="addingChannel"
                />
                <p class="text-xs text-gray-500 mt-1">
                  Create a bot with @BotFather and get the token
                </p>
              </div>
            </div>

            <!-- Common fields -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-2">Display Name</label>
                <input
                  v-model="newChannelName"
                  type="text"
                  placeholder="e.g., Family Group, Movie Club"
                  class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  :disabled="addingChannel"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-600 mb-2">Notification Language</label>
                <select
                  v-model="newChannelLanguage"
                  class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  :disabled="addingChannel"
                >
                  <option
                    v-for="lang in config.supportedLanguages"
                    :key="lang.code"
                    :value="lang.code"
                  >
                    {{ lang.name }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Test & Add Buttons -->
            <div class="flex items-center gap-4">
              <!-- Test Button -->
              <button
                @click="testNewChannelConfig"
                :disabled="testingNewChannel || !newChannelTarget || (newChannelType === 'telegram' && !newChannelTelegramToken) || (newChannelType === 'whatsapp' && !whatsappConnected)"
                class="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {{ testingNewChannel ? 'Testing...' : 'Test' }}
              </button>

              <!-- Add Button -->
              <button
                @click="addChannel"
                :disabled="addingChannel || !newChannelTarget || !newChannelName || (newChannelType === 'telegram' && !newChannelTelegramToken) || (newChannelType === 'whatsapp' && !whatsappConnected)"
                class="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {{ addingChannel ? 'Adding...' : 'Add Channel' }}
              </button>

              <!-- Test Result -->
              <span
                v-if="testNewChannelResult"
                class="text-sm px-3 py-1 rounded"
                :class="testNewChannelResult.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
              >
                {{ testNewChannelResult.success ? 'Test successful!' : testNewChannelResult.error }}
              </span>
            </div>
          </div>
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
