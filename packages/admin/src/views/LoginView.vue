<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const password = ref('')
const error = ref<string | null>(null)
const loading = ref(false)

async function handleLogin() {
  if (!password.value) {
    error.value = 'Password required'
    return
  }

  loading.value = true
  error.value = null

  const result = await authStore.login(password.value)

  loading.value = false

  if (result.success) {
    router.push('/')
  } else {
    error.value = result.error || 'Login failed'
    password.value = ''
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100">
    <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
      <h1 class="text-2xl font-bold text-center mb-6">Jellyfin WhatsApp Notifier</h1>
      <h2 class="text-lg text-gray-600 text-center mb-8">Admin Login</h2>

      <form @submit.prevent="handleLogin" class="space-y-6">
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
            Password
          </label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            :disabled="loading"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100"
            placeholder="Enter admin password"
          />
        </div>

        <div v-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {{ error }}
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span v-if="loading">Logging in...</span>
          <span v-else>Login</span>
        </button>
      </form>
    </div>
  </div>
</template>
