import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type AppOverlay = 'chat-search' | 'chat-new-session' | null

export const useUiStore = defineStore('ui', () => {
  const isChatImmersive = ref(false)
  const activeOverlay = ref<AppOverlay>(null)
  const isBodyScrollLocked = ref(false)

  const isTabBarHidden = computed(() => isChatImmersive.value)
  const isAppHeaderHidden = computed(() => isChatImmersive.value)

  function enterChatImmersive() {
    isChatImmersive.value = true
  }

  function leaveChatImmersive() {
    isChatImmersive.value = false
    activeOverlay.value = null
  }

  function setActiveOverlay(overlay: AppOverlay) {
    activeOverlay.value = overlay
  }

  watch(
    () => Boolean(activeOverlay.value),
    (locked) => {
      isBodyScrollLocked.value = locked
      if (typeof document === 'undefined') return
      document.documentElement.classList.toggle('app-scroll-locked', locked)
      document.body.classList.toggle('app-scroll-locked', locked)
    },
    { immediate: true },
  )

  return {
    isChatImmersive,
    isTabBarHidden,
    isAppHeaderHidden,
    activeOverlay,
    isBodyScrollLocked,
    enterChatImmersive,
    leaveChatImmersive,
    setActiveOverlay,
  }
})
