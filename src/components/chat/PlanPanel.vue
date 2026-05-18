<script setup lang="ts">
import { CircleCheck, CircleClose, Document, Folder, Loading, Search, SetUp } from '@element-plus/icons-vue'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AgentPlan, PlanTask, ToolLog } from '../../stores/chat'

const props = defineProps<{
  plan: AgentPlan
  isSending: boolean
}>()
const { t } = useI18n()

const statusIcon = (status: PlanTask['status']) => {
  if (status === 'success') return CircleCheck
  if (status === 'error') return CircleClose
  if (status === 'running') return Loading
  return undefined
}

const statusColor = (status: PlanTask['status']) => {
  if (status === 'success') return '#67c23a'
  if (status === 'error') return '#f56c6c'
  if (status === 'running') return '#409eff'
  return '#909399'
}

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

const isErrorResult = (result: unknown) => {
  if (typeof result === 'object' && result !== null && 'error' in result) return true
  return false
}

const overallStatus = computed(() => {
  const p = props.plan
  if (p.status === 'completed') return { label: t('plan.completed'), color: '#67c23a' }
  if (p.status === 'failed') return { label: t('plan.failed'), color: '#f56c6c' }
  if (p.status === 'executing') return { label: t('plan.executing'), color: '#409eff' }
  return { label: t('plan.planning'), color: '#e6a23c' }
})
</script>

<template>
  <div class="plan-panel">
    <!-- 计划头部 -->
    <div class="plan-header">
      <div class="plan-title">
        <span
          class="plan-badge"
          :style="{ background: overallStatus.color + '20', color: overallStatus.color }"
        >
          {{ overallStatus.label }}
        </span>
        <span class="plan-goal">{{ plan.goal }}</span>
      </div>
      <div v-if="plan.tasks.length" class="plan-progress">
        {{
          t('plan.progress', {
            done: plan.tasks.filter((t) => t.status === 'success').length,
            total: plan.tasks.length,
          })
        }}
      </div>
    </div>

    <!-- 任务列表 -->
    <div v-if="plan.tasks.length" class="task-list">
      <div
        v-for="(task, index) in plan.tasks"
        :key="task.id"
        class="task-item"
        :class="{ 'is-running': task.status === 'running', 'is-active': plan.currentTaskIndex === index }"
      >
        <div class="task-main">
          <div class="task-status">
            <el-icon
              v-if="statusIcon(task.status)"
              :size="16"
              :color="statusColor(task.status)"
              class="status-icon"
              :class="{ 'is-spinning': task.status === 'running' }"
            >
              <component :is="statusIcon(task.status)" />
            </el-icon>
            <span v-else class="status-dot" :style="{ background: statusColor(task.status) }"></span>
          </div>
          <div class="task-body">
            <div class="task-title-text">{{ index + 1 }}. {{ task.title }}</div>
            <div v-if="task.description" class="task-desc">{{ task.description }}</div>
            <div v-if="task.result" class="task-result" :class="{ 'is-error': task.status === 'error' }">
              {{ task.result }}
            </div>

            <!-- 任务内工具调用日志 -->
            <div v-if="task.toolLogs?.length" class="task-tool-logs">
              <div
                v-for="(log, logIdx) in task.toolLogs"
                :key="logIdx"
                class="task-tool-log"
                :class="{ 'has-result': log.result !== undefined, 'is-error': isErrorResult(log.result) }"
              >
                <div class="tool-log-header">
                  <el-icon class="tool-icon"><component :is="toolIcon(log.name)" /></el-icon>
                  <span class="tool-name">{{ toolLabel(log.name) }}</span>
                  <span class="tool-args" :title="argsSummary(log)">{{ argsSummary(log) }}</span>
                  <span v-if="log.result !== undefined" class="tool-status">
                    <el-icon v-if="isErrorResult(log.result)" class="status-icon error" :size="14"
                      ><CircleClose
                    /></el-icon>
                    <el-icon v-else class="status-icon success" :size="14"><CircleCheck /></el-icon>
                  </span>
                  <span v-else class="tool-status">
                    <span class="status-pulse"></span>
                  </span>
                </div>
                <div v-if="log.result !== undefined" class="tool-log-result">
                  {{ resultSummary(log.result) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 规划中的加载态 -->
    <div v-else-if="isSending" class="plan-loading">
      <el-icon class="is-spinning" :size="20"><Loading /></el-icon>
      <span>{{ t('plan.loading') }}</span>
    </div>
  </div>
</template>

<style scoped>
.plan-panel {
  margin: 12px 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(248, 251, 247, 0.76));
  border: 1px solid rgba(23, 32, 26, 0.08);
  border-radius: 18px;
  overflow: hidden;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.7) inset,
    0 14px 34px rgba(23, 32, 26, 0.06);
}

.plan-header {
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.58);
  border-bottom: 1px solid rgba(23, 32, 26, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.plan-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.plan-badge {
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}

.plan-goal {
  font-size: 13px;
  font-weight: 650;
  color: #1f2c25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-progress {
  font-size: 12px;
  color: #66706a;
  white-space: nowrap;
  flex-shrink: 0;
}

.task-list {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-item {
  border: 1px solid rgba(23, 32, 26, 0.05);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.52);
  transition:
    background 0.2s,
    border-color 0.2s,
    box-shadow 0.2s;
}

.task-item.is-active {
  border-color: rgba(52, 96, 78, 0.16);
  background: rgba(236, 245, 239, 0.92);
  box-shadow: 0 12px 24px rgba(23, 32, 26, 0.05);
}

.task-main {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
}

.task-status {
  flex-shrink: 0;
  padding-top: 2px;
}

.status-icon.is-spinning {
  animation: spin 1.2s linear infinite;
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin: 4px;
}

.task-body {
  flex: 1;
  min-width: 0;
}

.task-title-text {
  font-size: 13px;
  font-weight: 650;
  color: #233028;
  line-height: 1.4;
}

.task-desc {
  font-size: 12px;
  color: #66706a;
  margin-top: 3px;
  line-height: 1.4;
}

.task-result {
  font-size: 12px;
  color: #55635b;
  margin-top: 6px;
  padding: 6px 10px;
  background: #f0f9eb;
  border-radius: 10px;
  line-height: 1.5;
  word-break: break-all;
}

.task-result.is-error {
  background: #fef0f0;
  color: #f56c6c;
}

.task-tool-logs {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-tool-log {
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(23, 32, 26, 0.08);
  border-radius: 10px;
  padding: 7px 9px;
  font-size: 11px;
}

.task-tool-log.is-error {
  border-color: #f56c6c;
}

.tool-log-header {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.tool-icon {
  font-size: 12px;
  color: #7c8780;
  flex-shrink: 0;
}

.tool-name {
  font-weight: 600;
  color: #55635b;
  white-space: nowrap;
  flex-shrink: 0;
}

.tool-args {
  color: #7c8780;
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

.status-icon.success {
  color: #67c23a;
}

.status-icon.error {
  color: #f56c6c;
}

.status-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #409eff;
  animation: pulse 1.2s infinite ease-in-out;
}

.tool-log-result {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed rgba(23, 32, 26, 0.08);
  color: #55635b;
  line-height: 1.4;
  word-break: break-all;
}

.plan-loading {
  padding: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: #66706a;
}

.is-spinning {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
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
</style>
