<script setup lang="ts">
import { Check, CopyDocument, Download } from '@element-plus/icons-vue'
import DOMPurify from 'dompurify'
import ElButton from 'element-plus/es/components/button/index.mjs'
import Prism from 'prismjs'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-diff'
import { computed } from 'vue'
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
const normalizedLanguage = computed(() => normalizeLanguage(props.language))
const languageLabel = computed(() => normalizedLanguage.value.toUpperCase())
const lineCount = computed(() => props.content.split('\n').length)
const highlightedContent = computed(() => {
  const code = String(props.content || '')
  const language = normalizedLanguage.value
  const grammar = Prism.languages[language]
  if (!code) return ''
  if (!grammar) return escapeHtml(code)
  return DOMPurify.sanitize(Prism.highlight(code, grammar, language))
})

function handleCopy() {
  emit('copy', props.messageId, props.content, props.blockIndex)
}

function handleDownload() {
  const extension = languageToExtension(normalizedLanguage.value)
  const fallback = `code-${props.messageId.slice(0, 8)}-${props.blockIndex + 1}`
  const fileName = `${fallback}.${extension}`
  const blob = new Blob([props.content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function normalizeLanguage(language?: string) {
  const value = String(language || 'text')
    .trim()
    .toLowerCase()
  if (!value) return 'text'
  if (value === 'shell' || value === 'sh' || value === 'zsh') return 'bash'
  if (value === 'html' || value === 'vue') return 'markup'
  if (value === 'js') return 'javascript'
  if (value === 'ts') return 'typescript'
  if (value === 'yml') return 'yaml'
  return value
}

function languageToExtension(language: string) {
  const map: Record<string, string> = {
    bash: 'sh',
    markup: 'html',
    javascript: 'js',
    typescript: 'ts',
    python: 'py',
    sql: 'sql',
    yaml: 'yml',
    json: 'json',
    markdown: 'md',
    diff: 'diff',
    css: 'css',
    clike: 'c',
    text: 'txt',
  }
  return map[language] || 'txt'
}

function escapeHtml(code: string) {
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
</script>

<template>
  <div class="code-block-wrapper">
    <div class="code-header">
      <div class="code-header-main">
        <span class="language">{{ languageLabel }}</span>
        <span class="code-meta">{{ lineCount }} {{ t('common.lines') }}</span>
      </div>
      <div class="code-header-actions">
        <el-button :icon="Download" size="small" text @click="handleDownload">
          {{ t('common.download') }}
        </el-button>
        <el-button :icon="copied ? Check : CopyDocument" size="small" text @click="handleCopy">
          {{ copied ? t('common.copied') : t('common.copy') }}
        </el-button>
      </div>
    </div>
    <pre><code :class="`language-${normalizedLanguage}`" v-html="highlightedContent"></code></pre>
  </div>
</template>

<style scoped>
.code-block-wrapper {
  max-width: 100%;
  min-width: 0;
  margin: 14px 0;
  border: 1px solid rgba(59, 47, 41, 0.14);
  border-radius: 16px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 14%),
    linear-gradient(180deg, #2b211c 0%, #1d1714 100%);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 18px 40px rgba(0, 0, 0, 0.18);
}

.code-header {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
  padding: 10px 14px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.08);
  font-size: 12px;
  font-weight: 700;
  color: #d8c2a8;
}

.code-header-main {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.code-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.language {
  min-width: 0;
  overflow: hidden;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  text-overflow: ellipsis;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.code-meta {
  color: rgba(181, 128, 91, 0.78);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.code-block-wrapper pre {
  position: relative;
  max-width: 100%;
  margin: 0;
  padding: 16px 18px 18px;
  max-height: min(60vh, 680px);
  overflow-x: auto;
  overflow-y: auto;
  background: transparent;
  color: #fff7ed;
  font-size: 13px;
  line-height: 1.65;
  tab-size: 2;
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
  width: 11px;
  height: 11px;
}

.code-block-wrapper pre::-webkit-scrollbar-thumb {
  background: rgba(181, 128, 91, 0.34);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

.code-block-wrapper pre::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
}

:deep(.code-header .el-button) {
  --el-button-bg-color: transparent;
  --el-button-border-color: transparent;
  --el-button-hover-bg-color: rgba(255, 255, 255, 0.12);
  --el-button-hover-border-color: transparent;
  --el-button-active-bg-color: rgba(255, 255, 255, 0.2);
  --el-button-active-border-color: transparent;
  --el-button-text-color: #d8c2a8;
  --el-button-hover-text-color: #ffffff;
}

:deep(code[class*='language-']) {
  color: #fff7ed;
  background: transparent;
  text-shadow: none;
}

:deep(.token.comment),
:deep(.token.prolog),
:deep(.token.doctype),
:deep(.token.cdata) {
  color: #b7a28c;
}

:deep(.token.punctuation) {
  color: #ead8c6;
}

:deep(.token.property),
:deep(.token.tag),
:deep(.token.constant),
:deep(.token.symbol),
:deep(.token.deleted) {
  color: #f3c990;
}

:deep(.token.boolean),
:deep(.token.number) {
  color: #d8b17a;
}

:deep(.token.selector),
:deep(.token.attr-name),
:deep(.token.string),
:deep(.token.char),
:deep(.token.builtin),
:deep(.token.inserted) {
  color: #f2bd5c;
}

:deep(.token.operator),
:deep(.token.entity),
:deep(.token.url),
:deep(.language-css .token.string),
:deep(.style .token.string) {
  color: #ead8c6;
}

:deep(.token.atrule),
:deep(.token.attr-value),
:deep(.token.keyword) {
  color: #e8a262;
}

:deep(.token.function),
:deep(.token.class-name) {
  color: #f3c990;
}

:deep(.token.regex),
:deep(.token.important),
:deep(.token.variable) {
  color: #f1bc9f;
}
</style>
