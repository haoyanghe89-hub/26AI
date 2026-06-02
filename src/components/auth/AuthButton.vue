<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'wechat' | 'qq' | 'primary' | 'secondary' | 'ghost' | 'text'
    type?: 'button' | 'submit'
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    variant: 'primary',
    type: 'button',
    disabled: false,
    loading: false,
  },
)

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    class="auth-button"
    :class="[`auth-button--${variant}`, { 'is-loading': loading }]"
    :type="type"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <span v-if="$slots.icon || loading" class="auth-button__icon" aria-hidden="true">
      <span v-if="loading" class="auth-spinner"></span>
      <slot v-else name="icon"></slot>
    </span>
    <span class="auth-button__label">
      <slot></slot>
    </span>
  </button>
</template>
