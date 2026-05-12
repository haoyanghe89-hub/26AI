<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <a class="skip-link" href="#main-content">{{ t('app.skipToMain') }}</a>
  <router-view />
</template>
