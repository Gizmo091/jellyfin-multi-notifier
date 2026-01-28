import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import DashboardView from '../views/DashboardView.vue'
import LoginView from '../views/LoginView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { public: true },
    },
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/config',
      name: 'config',
      component: () => import('../views/ConfigView.vue'),
    },
    {
      path: '/queue',
      name: 'queue',
      component: () => import('../views/QueueView.vue'),
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('../views/LogsView.vue'),
    },
  ],
})

// Auth guard
router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  // Check auth status on first load
  if (authStore.isLoading) {
    await authStore.checkAuth()
  }

  // Public routes don't need auth
  if (to.meta.public) {
    // Redirect to dashboard if already logged in
    if (authStore.isAuthenticated) {
      return { name: 'dashboard' }
    }
    return true
  }

  // Protected routes need auth
  if (!authStore.isAuthenticated) {
    return { name: 'login' }
  }

  return true
})

export default router
