<script setup lang="ts">
import AppIcon from './AppIcon.vue'

defineProps<{
  tabs: Array<{ id: string; label: string; icon: string }>
  activeTab: string
}>()

defineEmits<{
  (event: 'update:activeTab', value: string): void
}>()
</script>

<template>
  <nav class="mobile-tab-bar" aria-label="底部导航">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      :class="{ active: tab.id === activeTab }"
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
  right: 10px;
  bottom: max(8px, env(safe-area-inset-bottom));
  left: 10px;
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 2px;
  max-width: 520px;
  margin: 0 auto;
  padding: 8px;
  border: 1px solid rgba(142, 115, 82, 0.12);
  border-radius: 24px;
  background: rgba(255, 252, 247, 0.92);
  box-shadow: 0 18px 46px rgba(82, 62, 38, 0.16);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}

button {
  display: grid;
  min-width: 0;
  min-height: 52px;
  place-items: center;
  gap: 2px;
  padding: 6px 0 5px;
  border: 0;
  border-radius: 18px;
  background: transparent;
  color: #9b8d7c;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  transition:
    color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;
}

button.active {
  background: linear-gradient(180deg, #fff7ed, #fff0dc);
  color: #c9792b;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.86) inset,
    0 8px 18px rgba(173, 101, 42, 0.1);
}

button:active {
  transform: scale(0.96);
}
</style>
