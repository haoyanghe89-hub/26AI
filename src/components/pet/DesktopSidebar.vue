<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import PetSwitcher from './PetSwitcher.vue'
import type { PetProfile } from '../../stores/chat'

defineProps<{
  modules: Array<{ id: string; label: string; hint: string; icon: string }>
  activeModule: string
  pets: PetProfile[]
  activePetId: string
}>()

defineEmits<{
  (event: 'update:activeModule', value: string): void
  (event: 'selectPet', value: string): void
  (event: 'addPet'): void
  (event: 'openSettings'): void
}>()
</script>

<template>
  <aside class="desktop-sidebar">
    <div class="brand-row">
      <div class="brand-mark">
        <img src="/assets/images/app-logo.png" alt="" />
      </div>
      <div>
        <strong>宠物 AI 管家</strong>
        <span>Pet Life OS</span>
      </div>
    </div>

    <PetSwitcher
      :pets="pets"
      :active-pet-id="activePetId"
      desktop
      @select-pet="$emit('selectPet', $event)"
      @add-pet="$emit('addPet')"
    />

    <nav class="desktop-nav" aria-label="桌面功能导航">
      <button
        v-for="item in modules"
        :key="item.id"
        type="button"
        :class="{ active: item.id === activeModule }"
        @click="$emit('update:activeModule', item.id)"
      >
        <AppIcon :name="item.icon" :size="20" />
        <span>
          <strong>{{ item.label }}</strong>
          <small>{{ item.hint }}</small>
        </span>
      </button>
    </nav>

    <button class="settings-link" type="button" @click="$emit('openSettings')">
      <AppIcon name="settings" :size="19" />
      <span>设置与模型</span>
    </button>
  </aside>
</template>

<style scoped>
.desktop-sidebar {
  position: sticky;
  top: 0;
  display: flex;
  width: 286px;
  height: 100vh;
  flex: 0 0 286px;
  flex-direction: column;
  gap: 20px;
  padding: 24px 18px;
  border-right: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow: 1px 0 24px rgba(142, 104, 60, 0.04);
  z-index: 10;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  width: 44px;
  height: 44px;
  overflow: hidden;
  border-radius: 16px;
  box-shadow: 0 16px 28px rgba(191, 110, 42, 0.22);
}

.brand-mark img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.brand-row strong {
  display: block;
  color: #2d261e;
  font-size: 17px;
}

.brand-row span {
  color: #9a8a79;
  font-size: 12px;
  font-weight: 700;
}

.desktop-nav {
  display: grid;
  gap: 6px;
  overflow: auto;
  padding-right: 2px;
}

.desktop-nav button,
.settings-link {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  border: 1px solid transparent;
  border-radius: 16px;
  background: transparent;
  color: #746657;
  font: inherit;
  text-align: left;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.desktop-nav button {
  padding: 11px 12px;
}

.desktop-nav button:hover,
.settings-link:hover {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(255, 255, 255, 0.9);
  color: #b96b25;
  transform: translateX(4px);
  box-shadow: 0 4px 12px rgba(142, 104, 60, 0.05);
}

.desktop-nav button.active {
  background: rgba(255, 255, 255, 0.9);
  color: #b96b25;
  border-color: rgba(255, 255, 255, 1);
  box-shadow:
    0 8px 16px rgba(142, 104, 60, 0.08),
    inset 0 0 0 1px rgba(226, 150, 66, 0.15);
  transform: translateX(4px);
}

.desktop-nav strong {
  display: block;
  color: inherit;
  font-size: 14px;
}

.desktop-nav small {
  display: block;
  margin-top: 2px;
  color: #a29483;
  font-size: 11px;
}

.settings-link {
  margin-top: auto;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.4);
  font-weight: 800;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
</style>
