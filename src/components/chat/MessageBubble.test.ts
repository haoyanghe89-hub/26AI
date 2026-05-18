import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MessageBubble from './MessageBubble.vue'
import { i18n, setLocale } from '../../i18n'
import type { ChatMessage } from '../../stores/chat'

function mountMessage(message: ChatMessage, isSending: boolean) {
  setLocale('zh-CN')
  return shallowMount(MessageBubble, {
    props: {
      message,
      isSending,
      copiedMessageId: null,
      copiedCodeBlock: null,
      isEditing: false,
      editingContent: '',
    },
    global: {
      plugins: [i18n],
      stubs: {
        ElButton: { template: '<button><slot /></button>' },
        ElTag: { template: '<span><slot /></span>' },
        CodeBlock: { template: '<pre />' },
      },
    },
  })
}

describe('MessageBubble', () => {
  it('shows a thinking placeholder while an assistant reply is pending', () => {
    const message: ChatMessage = {
      id: 'assistant-pending',
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    }

    const wrapper = mountMessage(message, true)

    expect(wrapper.find('.thinking').exists()).toBe(true)
    expect(wrapper.findAll('.thinking-dot').length).toBe(3)
  })

  it('shows a fallback when an assistant reply finishes empty', () => {
    const message: ChatMessage = {
      id: 'assistant-empty',
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    }

    const wrapper = mountMessage(message, false)

    expect(wrapper.text()).toContain('没有收到有效回复。')
  })

  it('treats empty multimodal assistant content as empty', () => {
    const message: ChatMessage = {
      id: 'assistant-empty-array',
      role: 'assistant',
      content: [],
      createdAt: new Date().toISOString(),
    }

    const wrapper = mountMessage(message, false)

    expect(wrapper.text()).toContain('没有收到有效回复。')
  })

  it('emits regenerate for assistant replies', async () => {
    const message: ChatMessage = {
      id: 'assistant-ready',
      role: 'assistant',
      content: '可以重新生成的回复',
      createdAt: new Date().toISOString(),
    }

    const wrapper = mountMessage(message, false)
    await wrapper
      .findAll('button')
      .find((button) => /重新回复|Regenerate/.test(button.text()))
      ?.trigger('click')

    expect(wrapper.emitted('regenerate-message')).toEqual([['assistant-ready']])
  })
})
