<script setup lang="ts">
import { computed } from 'vue'
import { MoreFilled } from '@element-plus/icons-vue'
import ElDropdown, { ElDropdownItem, ElDropdownMenu } from 'element-plus/es/components/dropdown/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import type { ChatSession } from '../../stores/chat'
import { useChatStore } from '../../stores/chat'

const props = defineProps<{
  session: ChatSession
  active: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const chat = useChatStore()

/** 列表区只展示一个代表性标签，其余在「当前会话标签」编辑框查看 */
const primaryListTag = computed(() => {
  const tags = props.session.tags
  return tags?.length ? tags[0] : ''
})

function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDetailTime(iso: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'full',
    timeStyle: 'medium',
  }).format(new Date(iso))
}

function buildSessionLink(sessionId: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('session', sessionId)
  return url.toString()
}

function handleSelect() {
  emit('select', props.session.id)
}

function handleRowKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    handleSelect()
  }
}

async function handleCommand(command: string) {
  const id = props.session.id
  const title = props.session.title

  if (command === 'copy-link') {
    const link = buildSessionLink(id)
    try {
      await navigator.clipboard.writeText(link)
      ElMessage.success('对话链接已复制到剪贴板')
    } catch {
      ElMessage.error('复制失败，请手动复制浏览器地址栏链接')
    }
    return
  }

  if (command === 'rename') {
    try {
      const { value } = await ElMessageBox.prompt('请输入新的会话标题', '重命名会话', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: title,
        inputValidator: (val: string) => {
          if (!val?.trim()) return '标题不能为空'
          return true
        },
      })
      const ok = chat.renameSession(id, value)
      if (ok) ElMessage.success('已保存')
      else ElMessage.error('重命名失败')
    } catch {
      /* 取消 */
    }
    return
  }

  if (command === 'details') {
    const { createdAt, updatedAt } = props.session
    await ElMessageBox.alert(
      `列表中不展示时间，以下为详细时间。\n\n最近更新（简写）：${formatSessionTime(updatedAt)}\n\n创建时间：${formatDetailTime(createdAt)}\n\n最后更新：${formatDetailTime(updatedAt)}`,
      '会话时间',
      {
        confirmButtonText: '关闭',
        customClass: 'session-detail-dialog',
      },
    )
    return
  }

  if (command === 'delete') {
    try {
      await ElMessageBox.confirm(`确定删除会话「${title}」吗？本地记录将一并移除，且不可恢复。`, '删除会话', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      })
      chat.deleteSession(id)
      ElMessage.success('已删除')
    } catch {
      /* 取消 */
    }
  }
}
</script>

<template>
  <div
    class="session-item"
    :class="{ active }"
    role="button"
    tabindex="0"
    @click="handleSelect"
    @keydown="handleRowKeydown"
  >
    <span class="session-item-main">
      <span class="session-item-row">
        <span class="session-title">{{ session.title }}</span>
        <span v-if="primaryListTag" class="session-tags-inline session-tags-trailing" aria-label="会话标签">
          <span class="session-tag-chip" :title="session.tags?.join('、')">{{ primaryListTag }}</span>
        </span>
      </span>
    </span>
    <span class="session-more-wrap" @click.stop @mousedown.stop>
      <el-dropdown trigger="click" teleported @command="handleCommand">
        <span class="session-more-trigger" role="button" tabindex="-1" title="更多操作" aria-label="更多操作">
          <el-icon><MoreFilled /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="copy-link">复制对话链接</el-dropdown-item>
            <el-dropdown-item command="rename">重命名</el-dropdown-item>
            <el-dropdown-item command="details">查看详细时间</el-dropdown-item>
            <el-dropdown-item command="delete" divided>删除对话</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </span>
  </div>
</template>
