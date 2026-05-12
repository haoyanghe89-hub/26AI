<script setup lang="ts">
import { Check, CopyDocument } from '@element-plus/icons-vue'
import ElButton from 'element-plus/es/components/button/index.mjs'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  messageId: string
  language?: string
  content: string
  blockIndex: number
  copied: boolean
}>()

const emit = defineEmits<{
  copy: [messageId: string, content: string, blockIndex: number]
}>()
const { t } = useI18n()

function handleCopy() {
  emit('copy', props.messageId, props.content, props.blockIndex)
}
</script>

<template>
  <div class="code-block-wrapper">
    <div class="code-header">
      <span class="language">{{ language || 'text' }}</span>
      <el-button :icon="copied ? Check : CopyDocument" size="small" text @click="handleCopy">
        {{ copied ? t('common.copied') : t('common.copy') }}
      </el-button>
    </div>
    <pre><code>{{ content }}</code></pre>
  </div>
</template>

<style scoped>
.code-block-wrapper {
  max-width: 100%;
  min-width: 0;
  margin: 8px 0;
  border: 1px solid rgba(23, 32, 26, 0.16);
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(180deg, #222b24 0%, #1a211c 100%);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 12px 32px rgba(0, 0, 0, 0.15);
}

.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  font-weight: 600;
  color: #a3b5a8;
}

.language {
  min-width: 0;
  overflow: hidden;
  font-family: ui-monospace, monospace;
  text-overflow: ellipsis;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.code-block-wrapper pre {
  max-width: 100%;
  margin: 0;
  padding: 14px 16px;
  overflow-x: auto;
  overflow-y: hidden;
  background: transparent;
  color: #e8f0e8;
  font-size: 13px;
  line-height: 1.55;
}

.code-block-wrapper code {
  display: block;
  width: max-content;
  min-width: 100%;
  font-family: 'JetBrains Mono', ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', monospace;
  font-variant-ligatures: none;
  white-space: pre;
}

.code-block-wrapper pre::-webkit-scrollbar {
  height: 10px;
}

.code-block-wrapper pre::-webkit-scrollbar-thumb {
  background: rgba(163, 181, 168, 0.35);
  border-radius: 999px;
}

.code-block-wrapper pre::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.06);
}

:deep(.code-header .el-button) {
  --el-button-bg-color: transparent;
  --el-button-border-color: transparent;
  --el-button-hover-bg-color: rgba(255, 255, 255, 0.12);
  --el-button-hover-border-color: transparent;
  --el-button-active-bg-color: rgba(255, 255, 255, 0.2);
  --el-button-active-border-color: transparent;
  --el-button-text-color: #a3b5a8;
  --el-button-hover-text-color: #ffffff;
}
</style>
