<script setup lang="ts">
import { Delete } from '@element-plus/icons-vue'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import type { ChatSession } from '../../stores/chat'

const props = defineProps<{
  session: ChatSession
  active: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  delete: [id: string]
}>()

function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function handleSelect() {
  emit('select', props.session.id)
}

function handleDelete(event: MouseEvent) {
  event.stopPropagation()
  emit('delete', props.session.id)
}
</script>

<template>
  <button type="button" class="session-item" :class="{ active }" @click="handleSelect">
    <span class="session-title">{{ session.title }}</span>
    <small>{{ formatSessionTime(session.updatedAt) }}</small>
    <el-icon class="delete-session" title="删除会话" @click="handleDelete">
      <Delete />
    </el-icon>
  </button>
</template>
