<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISSED_KEY = 'pet-ai-manager:pwa-install-dismissed-at'
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000

const route = useRoute()
const installEvent = ref<BeforeInstallPromptEvent | null>(null)
const isVisible = ref(false)
const isInstalled = ref(false)
const showManualSteps = ref(false)

const isEntryRoute = computed(() => route.name === 'login' || route.name === 'careExperienceOnboarding')
const canShow = computed(() => isVisible.value && !isInstalled.value && !isEntryRoute.value)
const isAndroid = computed(() => /Android/i.test(navigator.userAgent))

onMounted(() => {
  isInstalled.value = isStandalone()
  if (isInstalled.value || isRecentlyDismissed()) return

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installEvent.value = event as BeforeInstallPromptEvent
    isVisible.value = true
  })

  window.addEventListener('appinstalled', () => {
    isInstalled.value = true
    isVisible.value = false
  })

  window.setTimeout(() => {
    if (!isInstalled.value && !isRecentlyDismissed() && isAndroid.value) isVisible.value = true
  }, 2600)
})

async function installApp() {
  if (!installEvent.value) return
  await installEvent.value.prompt()
  const choice = await installEvent.value.userChoice.catch(() => null)
  if (choice?.outcome === 'accepted') {
    isVisible.value = false
    return
  }
  dismiss()
}

function dismiss() {
  localStorage.setItem(DISMISSED_KEY, String(Date.now()))
  isVisible.value = false
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    // iOS Safari uses this non-standard flag; harmless on Android.
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

function isRecentlyDismissed() {
  const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) || 0)
  return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_TTL_MS
}
</script>

<template>
  <aside v-if="canShow" class="pwa-install-prompt" role="status" aria-live="polite">
    <div>
      <strong>像 App 一样打开</strong>
      <p>
        {{
          installEvent
            ? '安装到桌面后会隐藏浏览器地址栏，滑动体验更接近原生 App。'
            : '当前浏览器没有开放系统安装弹窗，可以按步骤手动添加到桌面。'
        }}
      </p>
      <ol v-if="showManualSteps" class="manual-install-steps">
        <li>用 Chrome、Edge 或三星浏览器打开当前地址。</li>
        <li>点右上角菜单「⋮」。</li>
        <li>选择「安装应用」或「添加到主屏幕」。</li>
        <li>如果只看到「创建快捷方式」，通常是本地 HTTP 或浏览器策略限制；部署到 HTTPS 后会更稳定地出现安装按钮。</li>
      </ol>
    </div>
    <button v-if="installEvent" type="button" @click="installApp">安装</button>
    <button v-else type="button" @click="showManualSteps = !showManualSteps">
      {{ showManualSteps ? '收起' : '查看步骤' }}
    </button>
    <button type="button" class="ghost" @click="dismiss">稍后</button>
  </aside>
</template>

<style scoped>
.pwa-install-prompt {
  position: fixed;
  right: 14px;
  bottom: calc(92px + env(safe-area-inset-bottom));
  left: 14px;
  z-index: 80;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  max-width: 520px;
  margin: 0 auto;
  padding: 12px;
  border: 1px solid rgba(145, 116, 78, 0.14);
  border-radius: 20px;
  background: rgba(255, 252, 247, 0.96);
  box-shadow: 0 18px 44px rgba(82, 62, 38, 0.16);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

.pwa-install-prompt strong {
  display: block;
  color: #332820;
  font-size: 14px;
}

.pwa-install-prompt p {
  margin: 4px 0 0;
  color: #806d5b;
  font-size: 12px;
  line-height: 1.45;
}

.manual-install-steps {
  display: grid;
  gap: 4px;
  margin: 8px 0 0;
  padding-left: 18px;
  color: #6f5d4c;
  font-size: 12px;
  line-height: 1.45;
}

.pwa-install-prompt button {
  min-height: 38px;
  border: 0;
  border-radius: 13px;
  padding: 0 12px;
  background: linear-gradient(135deg, #d9824b, #b95e2f);
  color: #fffaf3;
  font: inherit;
  font-size: 12px;
  font-weight: 950;
}

.pwa-install-prompt button.ghost {
  background: #fff0dc;
  color: #a66d38;
}

@media (min-width: 900px) {
  .pwa-install-prompt {
    display: none;
  }
}
</style>
