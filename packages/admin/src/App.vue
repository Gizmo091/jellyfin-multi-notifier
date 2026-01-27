<script setup lang="ts">
import { RouterView, RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'

const route = useRoute()
const authStore = useAuthStore()

async function handleLogout() {
  await authStore.logout()
}
</script>

<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Header (only when authenticated) -->
    <header v-if="authStore.isAuthenticated" class="bg-primary-600 text-white shadow-lg">
      <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <h1 class="text-xl font-bold">Jellyfin WhatsApp Notifier</h1>

        <nav class="flex items-center space-x-6">
          <RouterLink
            to="/"
            class="hover:text-primary-200 transition-colors"
            :class="{ 'text-primary-200': route.name === 'dashboard' }"
          >
            Dashboard
          </RouterLink>
          <RouterLink
            to="/config"
            class="hover:text-primary-200 transition-colors"
            :class="{ 'text-primary-200': route.name === 'config' }"
          >
            Configuration
          </RouterLink>
          <RouterLink
            to="/queue"
            class="hover:text-primary-200 transition-colors"
            :class="{ 'text-primary-200': route.name === 'queue' }"
          >
            Queue
          </RouterLink>
          <button
            @click="handleLogout"
            class="bg-primary-700 hover:bg-primary-800 px-3 py-1 rounded transition-colors"
          >
            Logout
          </button>
        </nav>
      </div>
    </header>

    <!-- Main content -->
    <main :class="authStore.isAuthenticated ? 'max-w-7xl mx-auto px-4 py-8' : ''">
      <RouterView />
    </main>
  </div>
</template>
