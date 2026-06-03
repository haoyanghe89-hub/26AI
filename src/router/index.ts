import { createRouter, createWebHistory } from 'vue-router'
import ChatView from '../views/ChatView.vue'
import LoginView from '../views/LoginView.vue'
import CareExperienceOnboarding from '../components/onboarding/CareExperienceOnboarding.vue'
import { pinia } from '../stores'
import { useAuthStore } from '../stores/auth'

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior() {
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'chat',
      component: ChatView,
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/onboarding/care-experience',
      name: 'careExperienceOnboarding',
      component: CareExperienceOnboarding,
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore(pinia)
  await auth.hydrate()

  if (to.name !== 'login' && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    if (!auth.hasCompletedOnboarding) return { name: 'careExperienceOnboarding' }
    return { name: 'chat' }
  }

  if (
    auth.isAuthenticated &&
    !auth.hasCompletedOnboarding &&
    to.name !== 'careExperienceOnboarding'
  ) {
    return { name: 'careExperienceOnboarding' }
  }
})
