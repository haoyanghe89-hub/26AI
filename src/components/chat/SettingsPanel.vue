<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { ArrowDown, ArrowUp, Setting } from '@element-plus/icons-vue'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElSelect, { ElOption } from 'element-plus/es/components/select/index.mjs'
import type { AiProvider, ProviderId, ProviderModel } from '../../stores/chat'

const props = defineProps<{
  providers: AiProvider[]
  selectedProviderId: ProviderId
  selectedProvider: AiProvider
  apiKey: string
  model: string
  currentModelOptions: ProviderModel[]
}>()

const emit = defineEmits<{
  'select-provider': [value: string]
  'update-api-key': [value: string]
  'select-model': [value: string]
  'clear-history': []
}>()

const providerSelectRef = ref<InstanceType<typeof ElSelect> | null>(null)
const modelSelectRef = ref<InstanceType<typeof ElSelect> | null>(null)
const storedCollapsed = localStorage.getItem('twentys1x:settings-collapsed')
const isCollapsed = ref(storedCollapsed ? storedCollapsed === 'true' : Boolean(props.apiKey.trim()))

function toggleCollapsed() {
  isCollapsed.value = !isCollapsed.value
  localStorage.setItem('twentys1x:settings-collapsed', String(isCollapsed.value))
}

function handleProviderChange(value: string) {
  emit('select-provider', value)
  nextTick(() => providerSelectRef.value?.blur())
}

function handleModelChange(value: string) {
  emit('select-model', value)
  nextTick(() => modelSelectRef.value?.blur())
}
</script>

<template>
  <div class="settings-panel" :class="{ 'is-collapsed': isCollapsed }">
    <button type="button" class="settings-header" :aria-expanded="!isCollapsed" @click="toggleCollapsed">
      <span class="settings-title">
        <el-icon><Setting /></el-icon>
        配置
      </span>
      <span class="settings-summary">{{ selectedProvider.name }} · {{ model }}</span>
      <el-icon class="settings-chevron">
        <ArrowDown v-if="isCollapsed" />
        <ArrowUp v-else />
      </el-icon>
    </button>

    <div v-show="!isCollapsed" class="settings-body">
      <label>
        <span>AI 供应商</span>
        <el-select
          ref="providerSelectRef"
          :model-value="selectedProviderId"
          :reserve-keyword="false"
          popper-class="military-green-select-dropdown"
          @change="(value) => handleProviderChange(String(value))"
        >
          <el-option
            v-for="provider in providers"
            :key="provider.id"
            :label="provider.name"
            :value="provider.id"
          />
        </el-select>
      </label>
      <label>
        <span>{{ selectedProvider.keyLabel }}</span>
        <el-input
          :key="selectedProviderId"
          :model-value="apiKey"
          type="password"
          :placeholder="selectedProvider.keyPlaceholder"
          show-password
          autocomplete="off"
          @update:model-value="(value: string) => emit('update-api-key', value)"
        />
      </label>
      <label>
        <span>模型</span>
        <el-select
          ref="modelSelectRef"
          :model-value="model"
          filterable
          allow-create
          default-first-option
          :reserve-keyword="false"
          placeholder="选择或输入模型"
          popper-class="military-green-select-dropdown"
          @update:model-value="handleModelChange"
        >
          <el-option
            v-for="item in currentModelOptions"
            :key="item.value"
            :label="item.hint ? `${item.label} · ${item.hint}` : item.label"
            :value="item.value"
          />
        </el-select>
      </label>
      <el-button plain @click="emit('clear-history')">清空历史</el-button>
    </div>
  </div>
</template>
