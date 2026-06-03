<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { PetProfile } from '../../stores/chat'

withDefaults(
  defineProps<{
    pets: PetProfile[]
    activePetId: string
    desktop?: boolean
  }>(),
  {
    desktop: false,
  },
)

defineEmits<{
  (event: 'selectPet', value: string): void
  (event: 'addPet'): void
}>()
</script>

<template>
  <section class="pet-switcher" :class="{ desktop }">
    <div class="switcher-head">
      <span>当前宠物</span>
      <button type="button" @click="$emit('addPet')"><AppIcon name="plus" :size="15" /></button>
    </div>
    <div class="pet-options">
      <button
        v-for="pet in pets"
        :key="pet.id"
        type="button"
        :class="{ active: pet.id === activePetId }"
        @click="$emit('selectPet', pet.id)"
      >
        <img v-if="pet.avatarUrl" :src="pet.avatarUrl" alt="" />
        <span v-else class="pet-letter">{{ pet.name.slice(0, 1) || '宠' }}</span>
        <strong>{{ pet.name }}</strong>
        <small>{{ pet.breed || (pet.species === 'dog' ? '狗狗' : '猫咪') }}</small>
      </button>
      <p v-if="!pets.length" class="empty">还没有宠物档案</p>
    </div>
  </section>
</template>

<style scoped>
.pet-switcher {
  display: grid;
  gap: 8px;
  padding-top: 8px;
}

.switcher-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #9b8d7b;
  font-size: 12px;
  font-weight: 800;
}

.switcher-head button {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 1px solid rgba(145, 116, 78, 0.14);
  border-radius: 9px;
  background: #fffaf4;
  color: #bd722f;
}

.pet-options {
  display: flex;
  gap: 8px;
  overflow: auto;
  margin: 0 -4px;
  padding: 0 4px 3px;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}

.pet-options::-webkit-scrollbar {
  display: none;
}

.desktop .pet-options {
  display: grid;
  overflow: visible;
}

.pet-options button {
  display: grid;
  min-width: 122px;
  min-height: 56px;
  grid-template-columns: 34px 1fr;
  column-gap: 9px;
  align-items: center;
  padding: 8px;
  border: 1px solid rgba(146, 118, 86, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  color: #302820;
  font: inherit;
  text-align: left;
  scroll-snap-align: start;
}

.desktop .pet-options button {
  min-width: 0;
}

.pet-options button.active {
  border-color: rgba(220, 139, 55, 0.36);
  background: #fff1de;
  box-shadow: 0 12px 24px rgba(142, 93, 40, 0.08);
}

img,
.pet-letter {
  grid-row: span 2;
  width: 34px;
  height: 34px;
  border-radius: 12px;
}

img {
  object-fit: cover;
}

.pet-letter {
  display: grid;
  place-items: center;
  background: #f0a04b;
  color: #fff;
  font-weight: 900;
}

strong,
small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

strong {
  font-size: 13px;
}

small {
  color: #8d7e6d;
  font-size: 11px;
}

.empty {
  margin: 0;
  color: #9a8b7b;
  font-size: 13px;
}
</style>
