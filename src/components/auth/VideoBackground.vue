<script setup lang="ts">
withDefaults(
  defineProps<{
    videoSrc?: string
    imageSrc?: string
    posterSrc?: string
    quiet?: boolean
  }>(),
  {
    videoSrc: '',
    imageSrc: '/assets/images/login-dogs-hero.png',
    posterSrc: '/assets/images/login-dogs-hero.png',
    quiet: false,
  },
)
</script>

<template>
  <div class="auth-video" :class="{ 'auth-video--quiet': quiet }" aria-hidden="true">
    <img v-if="!videoSrc" class="auth-video__image" :src="imageSrc" alt="" />
    <video v-else autoplay muted loop playsinline preload="metadata" :poster="posterSrc">
      <source :src="videoSrc" type="video/mp4" />
    </video>
    <div class="auth-video__fallback"></div>
    <div class="auth-video__overlay"></div>
  </div>
</template>
