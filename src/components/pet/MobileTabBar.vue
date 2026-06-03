<script setup lang="ts">
import AppIcon from './AppIcon.vue'

defineProps<{
  tabs: Array<{ id: string; label: string; icon: string }>
  activeTab: string
  hidden?: boolean
}>()

defineEmits<{
  (event: 'update:activeTab', value: string): void
}>()
</script>

<template>
  <nav class="mobile-tab-bar" :class="{ 'is-hidden': hidden }" aria-label="底部导航">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      :class="{ active: tab.id === activeTab }"
      :aria-current="tab.id === activeTab ? 'page' : undefined"
      @click="$emit('update:activeTab', tab.id)"
    >
      <AppIcon :name="tab.icon" :size="21" />
      <span>{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.mobile-tab-bar {
  position: fixed;
  right: var(--space-3);
  bottom: calc(var(--space-2) + env(safe-area-inset-bottom));
  left: var(--space-3);
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 3px;
  min-height: 64px;
  max-width: 520px;
  margin: 0 auto;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: 24px;
  background: rgba(255, 252, 247, 0.96);
  box-shadow: var(--shadow-bottom-nav);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  transition:
    transform 260ms cubic-bezier(0.2, 0, 0, 1),
    opacity 220ms ease;
  will-change: transform, opacity;
}

.mobile-tab-bar.is-hidden {
  pointer-events: none;
  opacity: 0;
  transform: translateY(calc(100% + env(safe-area-inset-bottom) + 18px));
}

button {
  display: grid;
  min-width: 0;
  min-height: 48px;
  place-items: center;
  gap: 1px;
  padding: var(--space-1) 0;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: var(--color-text-weak);
  font: inherit;
  font-size: var(--font-xs);
  font-weight: 700;
  transition:
    color var(--motion-normal) var(--ease-standard),
    background var(--motion-normal) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}

button.active {
  background: linear-gradient(180deg, #fff4e8, #fff0dc);
  color: var(--color-primary-strong);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.86) inset,
    0 6px 14px rgba(173, 101, 42, 0.1);
}

button:active {
  transform: scale(0.96);
}

button:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 3px rgba(217, 130, 75, 0.16),
    0 0 0 1px rgba(217, 130, 75, 0.42) inset;
}

@media (prefers-reduced-motion: reduce) {
  .mobile-tab-bar {
    transition: opacity 120ms ease;
  }
}
</style>
