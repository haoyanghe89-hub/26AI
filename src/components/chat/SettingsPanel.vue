<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUp, Setting } from '@element-plus/icons-vue'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import type {
  AiProvider,
  InferenceMode,
  LocalModelStatus,
  ProviderId,
  ProviderModel,
} from '../../stores/chat'

defineProps<{
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
  'clear-history': []
}>()

const { t } = useI18n()
const storedCollapsed = localStorage.getItem('twentys1x:settings-collapsed')
const isCollapsed = ref(storedCollapsed ? storedCollapsed === 'true' : true)

function toggleCollapsed() {
  isCollapsed.value = !isCollapsed.value
  localStorage.setItem('twentys1x:settings-collapsed', String(isCollapsed.value))
}
</script>

<template>
  <div class="settings-panel" :class="{ 'is-collapsed': isCollapsed }">
    <button type="button" class="settings-header" :aria-expanded="!isCollapsed" @click="toggleCollapsed">
      <span class="settings-title">
        <el-icon><Setting /></el-icon>
        AI 助手
      </span>
      <span class="settings-summary">内置 PetExpert · RAG 知识库</span>
      <el-icon class="settings-chevron t1-chevron" :class="{ 'is-expanded': !isCollapsed }">
        <ArrowUp />
      </el-icon>
    </button>

    <div class="t1-collapse-wrap" :class="{ 'is-open': !isCollapsed }">
      <div class="t1-collapse-inner">
        <div class="settings-body">
          <p class="settings-note">
            你可以直接向 PetExpert 提问，不需要填写 API Key、选择厂家或配置模型。系统会自动结合宠物档案、最近记录和 RAG 知识库回答。
          </p>
          <div class="ai-built-in-grid">
            <span>
              <strong>自动专家路由</strong>
              <small>健康、营养、训练、猫咪/狗狗照看会自动匹配不同知识上下文。</small>
            </span>
            <span>
              <strong>RAG 知识库</strong>
              <small>已接入症状、营养、疫苗驱虫、报告解读和急症边界知识。</small>
            </span>
          </div>
          <el-button plain @click="emit('clear-history')">{{ t('chat.clearHistory') }}</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-built-in-grid {
  display: grid;
  gap: 10px;
}

.ai-built-in-grid span {
  display: grid;
  gap: 5px;
  padding: 12px;
  border: 1px solid rgba(154, 105, 58, 0.12);
  border-radius: 16px;
  background: #fff8ef;
}

.ai-built-in-grid strong {
  color: #332820;
  font-size: 14px;
}

.ai-built-in-grid small {
  color: #8c735d;
  font-size: 12px;
  line-height: 1.5;
}
</style>
