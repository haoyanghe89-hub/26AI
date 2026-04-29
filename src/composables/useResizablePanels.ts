import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { getStoredString, setStoredString } from '../lib/clientStorage'

type PanelSide = 'left' | 'preview' | 'right'

const PANEL_HANDLE_WIDTH = 8
const MAIN_MIN_WIDTH = 420

function loadStoredWidth(_key: string, fallback: number) {
  return fallback
}

async function loadStoredWidthAsync(key: string, fallback: number) {
  const saved = Number((await getStoredString(key)) || '')
  return Number.isFinite(saved) && saved > 0 ? saved : fallback
}

function persistPanelWidth(key: string, value: number) {
  void setStoredString(key, String(value))
}

function getPanelBounds(containerWidth: number) {
  const leftMin = Math.max(248, Math.round(containerWidth * 0.16))
  const leftMaxByRatio = Math.min(460, Math.round(containerWidth * 0.34))
  const rightMin = Math.max(260, Math.round(containerWidth * 0.18))
  const rightMaxByRatio = Math.min(580, Math.round(containerWidth * 0.42))
  const previewMin = Math.max(300, Math.round(containerWidth * 0.2))
  const previewMaxByRatio = Math.min(760, Math.round(containerWidth * 0.48))
  return { leftMin, leftMaxByRatio, rightMin, rightMaxByRatio, previewMin, previewMaxByRatio }
}

export function useResizablePanels(
  appShellEl: Ref<HTMLElement | null>,
  onPreviewVisibilityChange?: (visible: boolean) => void,
) {
  const leftSidebarWidth = ref(loadStoredWidth('twentys1x:left-sidebar-width', 304))
  const rightWorkspaceWidth = ref(loadStoredWidth('twentys1x:right-workspace-width', 380))
  const previewPanelWidth = ref(loadStoredWidth('twentys1x:preview-panel-width', 520))
  const isCodePreviewVisible = ref(false)
  const isDraggingPanels = ref(false)

  const appShellStyle = computed(() => ({
    '--sidebar-left-width': `${leftSidebarWidth.value}px`,
    '--preview-panel-width': `${isCodePreviewVisible.value ? previewPanelWidth.value : 0}px`,
    '--preview-handle-width': `${isCodePreviewVisible.value ? PANEL_HANDLE_WIDTH : 0}px`,
    '--workspace-width': `${rightWorkspaceWidth.value}px`,
  }))

  let cleanupDragListeners: (() => void) | null = null

  function clampPanelWidths() {
    const shell = appShellEl.value
    if (!shell) return
    const total = shell.clientWidth
    if (!total) return

    const { leftMin, leftMaxByRatio, rightMin, rightMaxByRatio, previewMin, previewMaxByRatio } =
      getPanelBounds(total)
    const handleCount = isCodePreviewVisible.value ? 3 : 2
    const usable = total - MAIN_MIN_WIDTH - PANEL_HANDLE_WIDTH * handleCount

    const constrainedUsable = Math.max(
      usable,
      leftMin + rightMin + (isCodePreviewVisible.value ? previewMin : 0),
    )

    const leftMax = Math.max(
      leftMin,
      Math.min(leftMaxByRatio, constrainedUsable - rightMin - (isCodePreviewVisible.value ? previewMin : 0)),
    )
    const rightMax = Math.max(
      rightMin,
      Math.min(rightMaxByRatio, constrainedUsable - leftMin - (isCodePreviewVisible.value ? previewMin : 0)),
    )

    leftSidebarWidth.value = Math.round(Math.min(Math.max(leftSidebarWidth.value, leftMin), leftMax))
    rightWorkspaceWidth.value = Math.round(Math.min(Math.max(rightWorkspaceWidth.value, rightMin), rightMax))

    if (!isCodePreviewVisible.value) return

    const previewMax = Math.max(
      previewMin,
      Math.min(previewMaxByRatio, constrainedUsable - leftSidebarWidth.value - rightWorkspaceWidth.value),
    )
    previewPanelWidth.value = Math.round(Math.min(Math.max(previewPanelWidth.value, previewMin), previewMax))

    const overflow = leftSidebarWidth.value + rightWorkspaceWidth.value + previewPanelWidth.value - usable
    if (overflow > 0) {
      const previewCanShrink = Math.max(0, previewPanelWidth.value - previewMin)
      const previewShrink = Math.min(previewCanShrink, overflow)
      previewPanelWidth.value -= previewShrink

      const remainderAfterPreview = overflow - previewShrink
      if (remainderAfterPreview > 0) {
        const rightCanShrink = Math.max(0, rightWorkspaceWidth.value - rightMin)
        const rightShrink = Math.min(rightCanShrink, remainderAfterPreview)
        rightWorkspaceWidth.value -= rightShrink

        const remainderAfterRight = remainderAfterPreview - rightShrink
        if (remainderAfterRight > 0) {
          const leftCanShrink = Math.max(0, leftSidebarWidth.value - leftMin)
          const leftShrink = Math.min(leftCanShrink, remainderAfterRight)
          leftSidebarWidth.value -= leftShrink
        }
      }
    }
  }

  function setCodePreviewVisible(visible: boolean) {
    isCodePreviewVisible.value = visible
    onPreviewVisibilityChange?.(visible)
    clampPanelWidths()
  }

  function toggleCodePreview() {
    setCodePreviewVisible(!isCodePreviewVisible.value)
  }

  function cleanupActiveDrag() {
    if (cleanupDragListeners) {
      cleanupDragListeners()
      cleanupDragListeners = null
    }
    isDraggingPanels.value = false
  }

  function startResize(side: PanelSide, event: MouseEvent) {
    const shell = appShellEl.value
    if (!shell) return
    event.preventDefault()

    const shellRect = shell.getBoundingClientRect()
    const total = shellRect.width
    const { leftMin, leftMaxByRatio, rightMin, rightMaxByRatio, previewMin, previewMaxByRatio } =
      getPanelBounds(total)
    const handleCount = isCodePreviewVisible.value ? 3 : 2
    const usable = total - MAIN_MIN_WIDTH - PANEL_HANDLE_WIDTH * handleCount
    const leftMax = Math.max(
      leftMin,
      Math.min(leftMaxByRatio, usable - rightMin - (isCodePreviewVisible.value ? previewMin : 0)),
    )
    const rightMax = Math.max(
      rightMin,
      Math.min(rightMaxByRatio, usable - leftMin - (isCodePreviewVisible.value ? previewMin : 0)),
    )
    const previewMax = Math.max(previewMin, Math.min(previewMaxByRatio, usable - leftMin - rightMin))

    isDraggingPanels.value = true

    const onMove = (moveEvent: MouseEvent) => {
      const offsetX = moveEvent.clientX - shellRect.left
      if (side === 'left') {
        const leftAllowedMax = Math.min(
          leftMax,
          total -
            rightWorkspaceWidth.value -
            (isCodePreviewVisible.value ? previewPanelWidth.value : 0) -
            PANEL_HANDLE_WIDTH * handleCount -
            MAIN_MIN_WIDTH,
        )
        leftSidebarWidth.value = Math.round(Math.min(Math.max(offsetX, leftMin), leftAllowedMax))
        persistPanelWidth('twentys1x:left-sidebar-width', leftSidebarWidth.value)
        return
      }

      if (side === 'preview') {
        if (!isCodePreviewVisible.value) return
        const rightSegment = rightWorkspaceWidth.value + PANEL_HANDLE_WIDTH
        const previewFromPointer = total - offsetX - rightSegment
        const previewAllowedMax = Math.min(
          previewMax,
          total -
            leftSidebarWidth.value -
            rightWorkspaceWidth.value -
            PANEL_HANDLE_WIDTH * handleCount -
            MAIN_MIN_WIDTH,
        )
        previewPanelWidth.value = Math.round(
          Math.min(Math.max(previewFromPointer, previewMin), previewAllowedMax),
        )
        persistPanelWidth('twentys1x:preview-panel-width', previewPanelWidth.value)
        return
      }

      const rightFromPointer = total - offsetX
      const rightAllowedMax = Math.min(
        rightMax,
        total -
          leftSidebarWidth.value -
          (isCodePreviewVisible.value ? previewPanelWidth.value : 0) -
          PANEL_HANDLE_WIDTH * handleCount -
          MAIN_MIN_WIDTH,
      )
      rightWorkspaceWidth.value = Math.round(Math.min(Math.max(rightFromPointer, rightMin), rightAllowedMax))
      persistPanelWidth('twentys1x:right-workspace-width', rightWorkspaceWidth.value)
    }

    const onUp = () => {
      cleanupActiveDrag()
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp, { once: true })
    cleanupDragListeners = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }

  async function hydrateStoredPanelWidths() {
    const [left, preview, right] = await Promise.all([
      loadStoredWidthAsync('twentys1x:left-sidebar-width', leftSidebarWidth.value),
      loadStoredWidthAsync('twentys1x:preview-panel-width', previewPanelWidth.value),
      loadStoredWidthAsync('twentys1x:right-workspace-width', rightWorkspaceWidth.value),
    ])

    leftSidebarWidth.value = left
    previewPanelWidth.value = preview
    rightWorkspaceWidth.value = right
    clampPanelWidths()
  }

  onMounted(() => {
    void hydrateStoredPanelWidths()
    clampPanelWidths()
    window.addEventListener('resize', clampPanelWidths)
  })

  onBeforeUnmount(() => {
    cleanupActiveDrag()
    window.removeEventListener('resize', clampPanelWidths)
  })

  return {
    appShellStyle,
    isDraggingPanels,
    isCodePreviewVisible,
    setCodePreviewVisible,
    toggleCodePreview,
    startResize,
    clampPanelWidths,
  }
}
