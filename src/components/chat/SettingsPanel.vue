<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()
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
        {{ t('settings.title') }}
      </span>
      <span class="settings-summary">
        {{
          inferenceMode === 'local'
            ? t('settings.localSummary', { model: localModel })
            : inferenceMode === 'auto'
              ? t('settings.hybridSummary', { localModel, model })
              : t('settings.providerSummary', { provider: selectedProvider.name, model })
        }}
      </span>
      <el-icon class="settings-chevron t1-chevron" :class="{ 'is-expanded': !isCollapsed }">
        <ArrowUp />
      </el-icon>
    </button>

    <div class="t1-collapse-wrap" :class="{ 'is-open': !isCollapsed }">
      <div class="t1-collapse-inner">
        <div class="settings-body">
          <p class="settings-note">
            普通用户默认使用宠物专家引擎；以下供应商与模型仅作为高级/管理员底层配置。
          </p>
          <label>
            <span>{{ t('settings.inferenceStrategy') }}</span>
            <el-select
              :model-value="inferenceMode"
              :reserve-keyword="false"
              popper-class="warm-orange-select-dropdown"
              @change="(value) => emit('select-inference-mode', value as InferenceMode)"
            >
              <el-option :label="t('settings.cloudModel')" value="cloud" />
              <el-option :label="t('settings.localModel')" value="local" />
              <el-option :label="t('settings.autoHybrid')" value="auto" />
            </el-select>
          </label>
          <label>
            <span>高级底层供应商</span>
            <el-select
              ref="providerSelectRef"
              :model-value="selectedProviderId"
              :reserve-keyword="false"
              popper-class="warm-orange-select-dropdown"
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
          <label v-if="inferenceMode !== 'local' && selectedProvider.needsApiKey">
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
            <span>{{ t('settings.cloudModel') }}</span>
            <el-select
              ref="modelSelectRef"
              :model-value="model"
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
              :placeholder="t('settings.chooseOrInputModel')"
              popper-class="warm-orange-select-dropdown"
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
              <span>{{ t('settings.localModel') }}</span>
              <el-button
                plain
                size="small"
                :icon="Refresh"
                :loading="isRefreshingLocalModels"
                @click="emit('refresh-local-models')"
              >
                {{ t('common.refresh') }}
              </el-button>
            </div>
            <el-select
              :model-value="localModel"
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
              :placeholder="t('settings.chooseOrInputOllama')"
              popper-class="warm-orange-select-dropdown"
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
                  ? t('settings.ollamaStatus', {
                      version: localModelStatus.version || t('settings.connected'),
                      count: localModelStatus.models.length,
                    })
                  : localModelStatus.error || t('settings.ollamaMissing')
              }}
            </p>
            <div v-if="inferenceMode === 'auto'" class="hybrid-fallback-row">
              <span>{{ t('settings.hybridFallback') }}</span>
              <el-switch
                :model-value="hybridFallbackToCloud"
                @update:model-value="
                  (value: boolean | string | number) => emit('update-hybrid-fallback', Boolean(value))
                "
              />
            </div>
          </div>
          <el-button plain @click="emit('clear-history')">{{ t('chat.clearHistory') }}</el-button>
        </div>
      </div>
    </div>
  </div>
</template>
