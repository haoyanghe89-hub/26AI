<script setup lang="ts">
import { computed, ref } from 'vue'
import { Hide, View } from '@element-plus/icons-vue'

const props = withDefaults(
  defineProps<{
    label: string
    type?: string
    placeholder?: string
    error?: string
    maxlength?: number
    inputmode?: 'text' | 'search' | 'email' | 'tel' | 'url' | 'none' | 'numeric' | 'decimal'
    autocomplete?: string
    passwordToggle?: boolean
  }>(),
  {
    type: 'text',
    placeholder: '',
    error: '',
    maxlength: undefined,
    inputmode: 'text',
    autocomplete: 'off',
    passwordToggle: false,
  },
)

const model = defineModel<string>({ required: true })
const isPasswordVisible = ref(false)
const inputType = computed(() => {
  if (!props.passwordToggle) return props.type
  return isPasswordVisible.value ? 'text' : 'password'
})
</script>

<template>
  <label class="auth-field" :class="{ 'has-error': error }">
    <span class="auth-field__label">{{ label }}</span>
    <span class="auth-field__control">
      <span v-if="$slots.icon" class="auth-field__icon" aria-hidden="true">
        <slot name="icon"></slot>
      </span>
      <input
        v-model="model"
        :type="inputType"
        :placeholder="placeholder"
        :maxlength="maxlength"
        :inputmode="inputmode"
        :autocomplete="autocomplete"
      />
      <button
        v-if="passwordToggle"
        class="auth-field__toggle"
        type="button"
        :aria-label="isPasswordVisible ? '隐藏密码' : '显示密码'"
        @click="isPasswordVisible = !isPasswordVisible"
      >
        <View v-if="!isPasswordVisible" />
        <Hide v-else />
      </button>
    </span>
    <span v-if="error" class="auth-field__error">{{ error }}</span>
  </label>
</template>
