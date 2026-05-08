<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { ArrowUp, Refresh, Setting } from '@element-plus/icons-vue'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElSelect, { ElOption } from 'element-plus/es/components/select/index.mjs'
import ElSwitch from 'element-plus/es/components/switch/index.mjs'
import type {
  AiProvider,
  InferenceMode,
  LocalModelStatus,
  ProviderId,
  ProviderModel,
} from '../../stores/chat'

const props = defineProps<{
  providers: AiProvider[]
  selectedProviderId: ProviderId
  selectedProvider: AiProvider
  apiKey: string
  model: string
  currentModelOptions: ProviderModel[]
  inferenceMode: InferenceMode
  localModel: string
  localModelOptions: ProviderModel[]
  localModelStatus: LocalModelStatus
  hybridFallbackToCloud: boolean
  isRefreshingLocalModels: boolean
}>()

const emit = defineEmits<{
  'select-provider': [value: string]
  'update-api-key': [value: string]
  'select-model': [value: string]
  'select-inference-mode': [value: InferenceMode]
  'select-local-model': [value: string]
  'update-hybrid-fallback': [value: boolean]
  'refresh-local-models': []
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

function handleLocalModelChange(value: string) {
  emit('select-local-model', value)
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
      <span class="settings-summary">
        {{
          inferenceMode === 'local'
            ? `本地 · ${localModel}`
            : inferenceMode === 'auto'
              ? `混合 · ${localModel} / ${model}`
              : `${selectedProvider.name} · ${model}`
        }}
      </span>
      <el-icon class="settings-chevron t1-chevron" :class="{ 'is-expanded': !isCollapsed }">
        <ArrowUp />
      </el-icon>
    </button>

    <div class="t1-collapse-wrap" :class="{ 'is-open': !isCollapsed }">
      <div class="t1-collapse-inner">
        <div class="settings-body">
          <label>
            <span>推理策略</span>
            <el-select
              :model-value="inferenceMode"
              :reserve-keyword="false"
              popper-class="military-green-select-dropdown"
              @change="(value) => emit('select-inference-mode', value as InferenceMode)"
            >
              <el-option label="云端模型" value="cloud" />
              <el-option label="本地模型" value="local" />
              <el-option label="自动混合" value="auto" />
            </el-select>
          </label>
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
          <label v-if="inferenceMode !== 'local'">
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
          <label v-if="inferenceMode !== 'local'">
            <span>云端模型</span>
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
          <div v-if="inferenceMode !== 'cloud'" class="local-model-box">
            <div class="local-model-heading">
              <span>本地模型</span>
              <el-button
                plain
                size="small"
                :icon="Refresh"
                :loading="isRefreshingLocalModels"
                @click="emit('refresh-local-models')"
              >
                刷新
              </el-button>
            </div>
            <el-select
              :model-value="localModel"
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
              placeholder="选择或输入 Ollama 模型"
              popper-class="military-green-select-dropdown"
              @update:model-value="handleLocalModelChange"
            >
              <el-option
                v-for="item in localModelOptions"
                :key="item.value"
                :label="item.hint ? `${item.label} · ${item.hint}` : item.label"
                :value="item.value"
              />
            </el-select>
            <p class="local-model-status" :class="{ 'is-online': localModelStatus.available }">
              {{
                localModelStatus.available
                  ? `Ollama ${localModelStatus.version || '已连接'} · ${localModelStatus.models.length} 个模型`
                  : localModelStatus.error || '未检测到 Ollama，可先启动本地服务后刷新'
              }}
            </p>
            <div v-if="inferenceMode === 'auto'" class="hybrid-fallback-row">
              <span>本地失败时切换云端</span>
              <el-switch
                :model-value="hybridFallbackToCloud"
                @update:model-value="
                  (value: boolean | string | number) => emit('update-hybrid-fallback', Boolean(value))
                "
              />
            </div>
          </div>
          <el-button plain @click="emit('clear-history')">清空历史</el-button>
        </div>
      </div>
    </div>
  </div>
</template>
