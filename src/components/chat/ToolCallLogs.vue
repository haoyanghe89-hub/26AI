<script setup lang="ts">
import { CircleCheck, CircleClose, Document, Folder, Search, SetUp } from '@element-plus/icons-vue'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import { useI18n } from 'vue-i18n'

export interface ToolLog {
  name: string
  arguments: Record<string, unknown>
  result?: unknown
}

defineProps<{
  logs: ToolLog[]
}>()
const { t } = useI18n()

const toolIcon = (name: string) => {
  if (name === 'read_file') return Document
  if (name === 'write_file') return Document
  if (name === 'list_directory') return Folder
  if (name === 'search_code') return Search
  if (name === 'run_command') return SetUp
  return SetUp
}

const toolLabel = (name: string) => {
  const labels: Record<string, string> = {
    read_file: t('plan.tools.read_file'),
    write_file: t('plan.tools.write_file'),
    list_directory: t('plan.tools.list_directory'),
    search_code: t('plan.tools.search_code'),
    run_command: t('plan.tools.run_command'),
  }
  return labels[name] || name
}

const hasResult = (log: ToolLog) => log.result !== undefined
const isError = (result: unknown) => {
  if (typeof result === 'object' && result !== null && 'error' in result) return true
  return false
}
const resultSummary = (result: unknown) => {
  if (typeof result === 'object' && result !== null) {
    const r = result as Record<string, unknown>
    if ('error' in r) return String(r.error)
    if ('content' in r && typeof r.content === 'string')
      return t('plan.readSuccess', { count: r.content.length })
    if ('success' in r) return t('plan.writeSuccess')
    if ('items' in r && Array.isArray(r.items)) return t('plan.itemsCount', { count: r.items.length })
    if ('results' in r && Array.isArray(r.results)) return t('plan.resultsCount', { count: r.results.length })
    if ('stdout' in r && typeof r.stdout === 'string') {
      const stdout = r.stdout || t('plan.noOutput')
      const stderr = r.stderr ? ` · ${t('plan.stderr', { message: String(r.stderr).slice(0, 60) })}` : ''
      return `${stdout.slice(0, 80)}${stdout.length > 80 ? '...' : ''}${stderr}`
    }
  }
  return JSON.stringify(result).slice(0, 120)
}

const argsSummary = (log: ToolLog) => {
  const args = log.arguments
  if (log.name === 'read_file' || log.name === 'write_file') return String(args.file_path || '')
  if (log.name === 'list_directory') return String(args.dir_path || '.')
  if (log.name === 'search_code') {
    const q = String(args.query || '')
    const p = args.file_pattern ? ` · ${args.file_pattern}` : ''
    return `${q}${p}`
  }
  if (log.name === 'run_command') return String(args.command || '')
  return JSON.stringify(args).slice(0, 80)
}
</script>

<template>
  <div class="tool-call-logs">
    <div
      v-for="(log, index) in logs"
      :key="index"
      class="tool-log-item"
      :class="{ 'has-result': hasResult(log), 'is-error': hasResult(log) && isError(log.result) }"
    >
      <div class="tool-log-header">
        <el-icon class="tool-icon"><component :is="toolIcon(log.name)" /></el-icon>
        <span class="tool-name">{{ toolLabel(log.name) }}</span>
        <span class="tool-args" :title="argsSummary(log)">{{ argsSummary(log) }}</span>
        <span v-if="hasResult(log)" class="tool-status">
          <el-icon v-if="isError(log.result)" class="status-icon error"><CircleClose /></el-icon>
          <el-icon v-else class="status-icon success"><CircleCheck /></el-icon>
        </span>
        <span v-else class="tool-status">
          <span class="status-pulse"></span>
        </span>
      </div>
      <div v-if="hasResult(log)" class="tool-log-result">
        {{ resultSummary(log.result) }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-call-logs {
  margin: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tool-log-item {
  background: var(--surface-color, #f5f5f5);
  border: 1px solid var(--border-color, #e4e7ed);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  transition: border-color 0.2s;
}

.tool-log-item.is-error {
  border-color: #f56c6c;
}

.tool-log-header {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tool-icon {
  font-size: 14px;
  color: #909399;
  flex-shrink: 0;
}

.tool-name {
  font-weight: 600;
  color: #606266;
  white-space: nowrap;
  flex-shrink: 0;
}

.tool-args {
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.tool-status {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.status-icon {
  font-size: 14px;
}

.status-icon.success {
  color: #d9824b;
}

.status-icon.error {
  color: #f56c6c;
}

.status-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d9824b;
  animation: pulse 1.2s infinite ease-in-out;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.8);
  }
}

.tool-log-result {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed #dcdfe6;
  color: #606266;
  line-height: 1.5;
  word-break: break-all;
}
</style>
