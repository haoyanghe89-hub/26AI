<script setup lang="ts">
import AppIcon from './AppIcon.vue'

withDefaults(
  defineProps<{
    icon: string
    title: string
    description: string
    tone?: 'warm' | 'ai' | 'care' | 'plain'
  }>(),
  {
    tone: 'plain',
  },
)
</script>

<template>
  <button type="button" class="feature-card" :class="`tone-${tone}`">
    <span><AppIcon :name="icon" :size="20" /></span>
    <strong>{{ title }}</strong>
    <small>{{ description }}</small>
  </button>
</template>

<style scoped>
.feature-card {
  display: grid;
  gap: 8px;
  min-height: 118px;
  padding: 16px;
  border: 1px solid rgba(145, 116, 78, 0.12);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.78);
  color: #342b22;
  font: inherit;
  text-align: left;
  box-shadow: 0 12px 26px rgba(97, 72, 42, 0.05);
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    border-color 0.16s ease;
}

.feature-card:hover {
  border-color: rgba(218, 138, 51, 0.26);
}

@media (hover: hover) and (pointer: fine) {
  .feature-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 18px 34px rgba(97, 72, 42, 0.08);
  }
}

span {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 14px;
  background: #f7efe5;
  color: #b9702d;
}

.tone-warm span {
  background: #fff0dd;
  color: #c9782b;
}

.tone-ai span {
  background: #f1edff;
  color: #7664c8;
}

.tone-care span {
  background: #fff0dc;
  color: #a9582f;
}

strong {
  font-size: 15px;
}

small {
  color: #8d7e6d;
  font-size: 12px;
  line-height: 1.45;
}
</style>
