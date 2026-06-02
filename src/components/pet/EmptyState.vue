<script setup lang="ts">
import AppIcon from './AppIcon.vue'

withDefaults(
  defineProps<{
    icon?: string
    title: string
    description?: string
  }>(),
  {
    icon: 'pet',
    description: '',
  },
)
</script>

<template>
  <div class="empty-state">
    <span><AppIcon :name="icon" :size="24" /></span>
    <strong>{{ title }}</strong>
    <p v-if="description">{{ description }}</p>
  </div>
</template>

<style scoped>
.empty-state {
  display: grid;
  place-items: center;
  gap: 8px;
  padding: 34px 18px;
  border: 1px dashed rgba(150, 118, 77, 0.22);
  border-radius: 22px;
  background: rgba(255, 250, 244, 0.58);
  color: #8c7c6c;
  text-align: center;
}

span {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 16px;
  background: #fff1df;
  color: #c9782b;
}

strong {
  color: #3a3027;
  font-size: 15px;
}

p {
  max-width: 420px;
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}
</style>
