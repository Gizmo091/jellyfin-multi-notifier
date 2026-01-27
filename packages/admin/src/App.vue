<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="min-h-screen">
    <header class="bg-primary-600 text-white shadow-lg">
      <div class="max-w-7xl mx-auto px-4 py-4">
        <h1 class="text-xl font-bold">Jellyfin WhatsApp Notifier</h1>
      </div>
    </header>
    <main class="max-w-7xl mx-auto px-4 py-8">
      <RouterView />
    </main>
  </div>
</template>
