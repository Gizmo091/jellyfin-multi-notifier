import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const isAuthenticated = ref(false)
  const isLoading = ref(true)

  async function checkAuth(): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/check', {
        credentials: 'include',
      })
      const data = await response.json()
      isAuthenticated.value = data.success && data.data.authenticated
      return isAuthenticated.value
    } catch {
      isAuthenticated.value = false
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function login(password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      })
      const data = await response.json()

      if (data.success) {
        isAuthenticated.value = true
        return { success: true }
      } else {
        return { success: false, error: data.error || 'Login failed' }
      }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  async function logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } finally {
      isAuthenticated.value = false
    }
  }

  return {
    isAuthenticated,
    isLoading,
    checkAuth,
    login,
    logout,
  }
})
