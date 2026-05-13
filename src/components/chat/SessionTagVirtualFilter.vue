<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useChatStore } from '../../stores/chat'

type Cell = { kind: 'all' } | { kind: 'tag'; value: string }

type SessionTagRow = {
  key: string
  cells: Cell[]
}

const props = defineProps<{
  tags: readonly string[]
  allLabel: string
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const TAG_ROW_HEIGHT = 34
const TAG_GAP = 6
const H_PAD = 20
const BORDER = 2
/** 关闭钮悬停才滑出，不占行内宽度（换行估算与纯标签一致） */
const TAG_REMOVE_EXTRA = 0

const chat = useChatStore()
const { t } = useI18n()

const rootEl = ref<HTMLElement | null>(null)
const containerWidth = ref(320)

let canvas: HTMLCanvasElement | null = null
let measureCtx: CanvasRenderingContext2D | null = null

function getMeasureContext() {
  if (!canvas) {
    canvas = document.createElement('canvas')
    measureCtx = canvas.getContext('2d')
  }
  return measureCtx
}

function measureChipPx(label: string): number {
  const ctx = getMeasureContext()
  if (!ctx) return Math.ceil(label.length * 12) + H_PAD + BORDER
  ctx.font =
    '750 12px "Plus Jakarta Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  return Math.ceil(ctx.measureText(label).width) + H_PAD + BORDER + 2
}

function packRows(width: number, allLabel: string, tags: readonly string[]): SessionTagRow[] {
  const maxW = Math.max(80, Math.floor(width))
  const rows: Cell[][] = []
  let row: Cell[] = []
  let used = 0

  const pushRow = () => {
    if (!row.length) return
    rows.push(row)
    row = []
    used = 0
  }

  const append = (cell: Cell, chipW: number) => {
    const extra = row.length ? TAG_GAP + chipW : chipW
    if (used + extra > maxW && row.length) {
      pushRow()
    }
    if (row.length) used += TAG_GAP
    used += chipW
    row.push(cell)
  }

  append({ kind: 'all' }, measureChipPx(allLabel))
  for (const value of tags) {
    append({ kind: 'tag', value }, measureChipPx(value) + TAG_REMOVE_EXTRA)
  }
  pushRow()

  return rows.map((cells) => ({
    key: cells.map((c) => (c.kind === 'all' ? '∅' : c.value)).join('\u241e'),
    cells,
  }))
}

const tagRows = shallowRef<SessionTagRow[]>([])

function recomputeRows() {
  tagRows.value = packRows(containerWidth.value, props.allLabel, props.tags)
}

let ro: ResizeObserver | null = null

onMounted(() => {
  const el = rootEl.value
  if (!el) return
  const apply = () => {
    const w = el.clientWidth
    if (w > 0 && w !== containerWidth.value) {
      containerWidth.value = w
    }
    recomputeRows()
  }
  apply()
  ro = new ResizeObserver(() => apply())
  ro.observe(el)
})

onUnmounted(() => {
  ro?.disconnect()
  ro = null
  canvas = null
  measureCtx = null
})

watch(
  () => [props.tags, props.allLabel] as const,
  () => recomputeRows(),
  { deep: true, immediate: true },
)

watch(containerWidth, () => recomputeRows())

function selectAll() {
  emit('update:modelValue', '')
}

function selectTag(tag: string) {
  emit('update:modelValue', tag)
}

async function confirmRemoveTag(tag: string) {
  try {
    await ElMessageBox.confirm(t('chat.removeGlobalTagMessage', { tag }), t('chat.removeGlobalTagTitle'), {
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
  } catch {
    return
  }
  const removed = chat.removeTagFromAllSessions(tag)
  if (removed) {
    if (props.modelValue === tag) emit('update:modelValue', '')
    ElMessage.success(t('chat.removeGlobalTagSuccess'))
  }
}

const isAllActive = computed(() => !props.modelValue)
</script>

<template>
  <div ref="rootEl" class="session-tag-virtual-root session-tags">
    <RecycleScroller
      class="session-tag-recycle"
      :items="tagRows"
      :item-size="TAG_ROW_HEIGHT"
      key-field="key"
      list-tag="div"
      item-tag="div"
    >
      <template #default="{ item }">
        <div class="session-tag-row" :style="{ height: `${TAG_ROW_HEIGHT}px` }">
          <template
            v-for="(cell, idx) in item.cells"
            :key="cell.kind === 'all' ? '__all__' : `${cell.value}:${idx}`"
          >
            <button
              v-if="cell.kind === 'all'"
              type="button"
              class="session-tag-filter"
              :class="{ active: isAllActive }"
              @click="selectAll"
            >
              {{ allLabel }}
            </button>
            <span v-else class="session-tag-filter-with-remove">
              <button
                type="button"
                class="session-tag-filter"
                :class="{ active: modelValue === cell.value }"
                @click="selectTag(cell.value)"
              >
                {{ cell.value }}
              </button>
              <span class="session-tag-remove-track">
                <button
                  type="button"
                  class="session-tag-remove"
                  :aria-label="`${t('chat.removeGlobalTagAria')}：${cell.value}`"
                  :title="`${t('chat.removeGlobalTagAria')}：${cell.value}`"
                  @click.stop="confirmRemoveTag(cell.value)"
                >
                  ×
                </button>
              </span>
            </span>
          </template>
        </div>
      </template>
    </RecycleScroller>
  </div>
</template>
