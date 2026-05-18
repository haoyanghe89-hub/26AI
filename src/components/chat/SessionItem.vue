<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t, locale } = useI18n()

/** 列表区只展示一个代表性标签，其余在「当前会话标签」编辑框查看 */
const primaryListTag = computed(() => {
  const tags = props.session.tags
  return tags?.length ? tags[0] : ''
})

function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat(locale.value, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDetailTime(iso: string) {
  return new Intl.DateTimeFormat(locale.value, {
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
      ElMessage.success(t('session.linkCopied'))
    } catch {
      ElMessage.error(t('session.linkCopyFailed'))
    }
    return
  }

  if (command === 'rename') {
    try {
      const { value } = await ElMessageBox.prompt(t('session.renamePrompt'), t('session.renameTitle'), {
        confirmButtonText: t('common.save'),
        cancelButtonText: t('common.cancel'),
        inputValue: title,
        inputValidator: (val: string) => {
          if (!val?.trim()) return t('session.titleRequired')
          return true
        },
      })
      const ok = chat.renameSession(id, value)
      if (ok) ElMessage.success(t('session.saved'))
      else ElMessage.error(t('session.renameFailed'))
    } catch {
      /* 取消 */
    }
    return
  }

  if (command === 'details') {
    const { createdAt, updatedAt } = props.session
    await ElMessageBox.alert(
      t('session.timeDetails', {
        shortUpdated: formatSessionTime(updatedAt),
        created: formatDetailTime(createdAt),
        updated: formatDetailTime(updatedAt),
      }),
      t('session.timeTitle'),
      {
        confirmButtonText: t('common.close'),
        customClass: 'session-detail-dialog',
      },
    )
    return
  }

  if (command === 'delete') {
    try {
      await ElMessageBox.confirm(t('session.deleteConfirm', { title }), t('session.deleteConfirmTitle'), {
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      })
      chat.deleteSession(id)
      ElMessage.success(t('session.deleted'))
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
        <span
          v-if="primaryListTag"
          class="session-tags-inline session-tags-trailing"
          :aria-label="t('session.tags')"
        >
          <span class="session-tag-chip" :title="session.tags?.join('、')">{{ primaryListTag }}</span>
        </span>
      </span>
      <span class="session-item-meta">
        <span class="session-time" :title="formatDetailTime(session.updatedAt)">{{
          formatSessionTime(session.updatedAt)
        }}</span>
        <span class="session-count">{{ session.messages.length }}</span>
      </span>
    </span>
    <span class="session-more-wrap" @click.stop @mousedown.stop>
      <el-dropdown trigger="click" teleported @command="handleCommand">
        <span
          class="session-more-trigger"
          role="button"
          tabindex="-1"
          :title="t('session.moreActions')"
          :aria-label="t('session.moreActions')"
        >
          <el-icon><MoreFilled /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="copy-link">{{ t('session.copyLink') }}</el-dropdown-item>
            <el-dropdown-item command="rename">{{ t('session.rename') }}</el-dropdown-item>
            <el-dropdown-item command="details">{{ t('session.details') }}</el-dropdown-item>
            <el-dropdown-item command="delete" divided>{{ t('session.deleteChat') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </span>
  </div>
</template>
